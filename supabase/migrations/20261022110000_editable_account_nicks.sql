BEGIN;

-- Account nick changes are the only operation allowed to rewrite display-name
-- snapshots. The transaction-local flag is set only inside rename_my_nick().
CREATE OR REPLACE FUNCTION public.guard_linked_group_player() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.auth_user_id=auth.uid()
    AND current_setting('app.nick_rename',true)='on'
    AND (NEW.id,NEW.group_id,NEW.auth_user_id)=(OLD.id,OLD.group_id,OLD.auth_user_id) THEN
  NEW.member_revision:=OLD.member_revision+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
 END IF;
 IF (TG_OP='INSERT' AND NEW.auth_user_id IS NULL) OR
    (TG_OP='DELETE' AND OLD.auth_user_id IS NULL) OR
    (TG_OP='UPDATE' AND OLD.auth_user_id IS NULL AND NEW.auth_user_id IS NULL) THEN
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retira la membresía; la ficha y sus resultados se conservan' USING ERRCODE='42501'; END IF;
 DELETE FROM public.group_write_permits WHERE tx=txid_current() AND entity=NEW.id AND operation='player';
 IF NOT FOUND OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'La ficha vinculada requiere una operación autorizada' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.group_id,NEW.auth_user_id,NEW.name) IS DISTINCT FROM (OLD.id,OLD.group_id,OLD.auth_user_id,OLD.name) THEN RAISE EXCEPTION 'La identidad de la ficha es inmutable'; END IF;
  NEW.member_revision:=OLD.member_revision+1;
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_linked_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.golf_rounds; has_linked boolean;
BEGIN
 IF TG_OP='UPDATE' AND current_setting('app.nick_rename',true)='on' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(20260910,1900);
 IF TG_OP='INSERT' THEN
  SELECT * INTO r FROM public.golf_rounds WHERE id=NEW.source_round_id FOR UPDATE;
  has_linked:=EXISTS(SELECT 1 FROM public.round_players rp JOIN public.players p ON p.id=rp.player_id WHERE rp.round_id=r.id AND p.auth_user_id IS NOT NULL)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.final_ranking,'[]')) f JOIN public.players p ON p.id::text=f->>'player_db_id' WHERE p.auth_user_id IS NOT NULL);
  IF has_linked OR r.id IS NOT NULL THEN
   PERFORM public.require_group_result_writer(NEW.group_id);
   IF r.id IS NULL OR r.group_id IS DISTINCT FROM NEW.group_id OR r.status<>'completed' THEN RAISE EXCEPTION 'Es necesaria una partida completada del mismo grupo'; END IF;
   WITH participants AS (SELECT rp.*,row_number() OVER(ORDER BY rp.created_at,rp.id) AS n FROM public.round_players rp WHERE rp.round_id=r.id),
   totals AS (SELECT rp.*,coalesce((SELECT sum(CASE WHEN coalesce(r.game_mode,'stableford')='stableford' THEN rs.stableford_points ELSE coalesce(rs.mode_points,0) END) FROM public.round_scores rs WHERE rs.player_id=rp.id AND rs.round_id=r.id),0) AS points,(SELECT count(*) FROM public.round_scores rs WHERE rs.player_id=rp.id AND rs.round_id=r.id AND rs.spanish_hands) AS hands,sum(rp.playing_handicap) OVER(PARTITION BY (rp.n-1)/2) AS team_hcp FROM participants rp),
   ranked AS (SELECT *,row_number() OVER(ORDER BY points DESC,CASE WHEN r.game_mode='parejas' THEN team_hcp ELSE playing_handicap END,playing_handicap,created_at,id) AS position FROM totals)
   SELECT jsonb_agg(jsonb_build_object('position',position,'player_name',name,'player_id',id,'player_db_id',player_id,'points',points,'hcp_juego',playing_handicap,'handicap',exact_handicap,'game_mode',coalesce(r.game_mode,'stableford')) ORDER BY position),jsonb_agg(coalesce((SELECT ps FROM jsonb_array_elements(coalesce(NEW.player_stats,'[]')) ps WHERE ps->>'player_id'=ranked.id::text LIMIT 1),'{}') || jsonb_build_object('player_id',id,'player_db_id',player_id,'player_name',name,'spanish_hands_count',hands) ORDER BY position)
   INTO NEW.final_ranking,NEW.player_stats FROM ranked; NEW.handicap_adjusted:=false;
  END IF;
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(OLD.final_ranking,'[]')) f JOIN public.players p ON p.id::text=f->>'player_db_id' WHERE p.auth_user_id IS NOT NULL) THEN
  IF TG_OP='DELETE' THEN PERFORM public.require_group_manager(OLD.group_id);
  ELSIF (NEW.group_id,NEW.final_ranking,NEW.player_stats,NEW.source_round_id) IS DISTINCT FROM (OLD.group_id,OLD.final_ranking,OLD.player_stats,OLD.source_round_id) THEN RAISE EXCEPTION 'Los resultados vinculados archivados son inmutables';
  ELSIF OLD.handicap_adjusted AND NOT NEW.handicap_adjusted THEN RAISE EXCEPTION 'Los ajustes de esta partida ya se han aplicado'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION public.snapshot_archive_guests() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.golf_rounds; item jsonb; participant public.round_players;
BEGIN
 IF TG_OP='UPDATE' AND current_setting('app.nick_rename',true)='on' THEN RETURN NEW; END IF;
 IF TG_OP='DELETE' THEN IF OLD.group_id IS NOT NULL AND OLD.source_round_id IS NOT NULL THEN PERFORM public.require_group_manager(OLD.group_id); END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.final_ranking,NEW.player_stats,NEW.hole_scores,NEW.group_id,NEW.source_round_id) IS DISTINCT FROM (OLD.final_ranking,OLD.player_stats,OLD.hole_scores,OLD.group_id,OLD.source_round_id) THEN RAISE EXCEPTION 'Los resultados archivados y la condición de invitado son inmutables'; END IF; RETURN NEW;
 END IF;
 IF NEW.group_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.source_round_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.final_ranking,'[]') || coalesce(NEW.player_stats,'[]') || coalesce(NEW.hole_scores,'[]')) f WHERE f ? 'is_guest') THEN RAISE EXCEPTION 'Es necesaria una partida de origen para registrar invitados'; END IF; RETURN NEW;
 END IF;
 PERFORM public.require_group_result_writer(NEW.group_id); SELECT * INTO r FROM public.golf_rounds WHERE id=NEW.source_round_id FOR UPDATE;
 IF r.id IS NULL OR r.group_id IS DISTINCT FROM NEW.group_id OR r.status<>'completed' THEN RAISE EXCEPTION 'Es necesaria una partida completada del mismo grupo'; END IF;
 IF jsonb_array_length(coalesce(NEW.final_ranking,'[]'))<>(SELECT count(*) FROM public.round_players WHERE round_id=r.id) THEN RAISE EXCEPTION 'El archivo debe incluir a todos los participantes'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.final_ranking) f GROUP BY f->>'player_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Participantes duplicados en el archivo'; END IF;
 FOR item IN SELECT f FROM jsonb_array_elements(NEW.final_ranking) f LOOP SELECT * INTO participant FROM public.round_players WHERE round_id=r.id AND id::text=item->>'player_id'; IF participant.id IS NULL THEN RAISE EXCEPTION 'Participante desconocido en el archivo'; END IF; END LOOP;
 SELECT jsonb_agg(f || jsonb_build_object('is_guest',rp.is_guest,'player_db_id',rp.player_id) ORDER BY ord) INTO NEW.final_ranking FROM jsonb_array_elements(NEW.final_ranking) WITH ORDINALITY f(f,ord) JOIN public.round_players rp ON rp.round_id=r.id AND rp.id::text=f->>'player_id';
 SELECT coalesce(jsonb_agg(ps || jsonb_build_object('is_guest',rp.is_guest,'player_db_id',rp.player_id) ORDER BY ord),'[]') INTO NEW.player_stats FROM jsonb_array_elements(coalesce(NEW.player_stats,'[]')) WITH ORDINALITY ps(ps,ord) JOIN public.round_players rp ON rp.round_id=r.id AND rp.id::text=ps->>'player_id';
 SELECT coalesce(jsonb_agg(h || jsonb_build_object('is_guest',rp.is_guest,'player_db_id',rp.player_id) ORDER BY ord),'[]') INTO NEW.hole_scores FROM jsonb_array_elements(coalesce(NEW.hole_scores,'[]')) WITH ORDINALITY h(h,ord) JOIN public.round_players rp ON rp.round_id=r.id AND rp.id::text=h->>'player_id'; RETURN NEW;
END $$;

CREATE FUNCTION public.rename_my_nick(p_nick text) RETURNS public.user_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid:=auth.uid(); v_nick text:=trim(p_nick); v_profile public.user_profiles; v_players uuid[]; v_round_players uuid[];
BEGIN
 IF v_user IS NULL OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'No tienes permiso para cambiar el nick' USING ERRCODE='42501'; END IF;
 IF v_nick IS NULL OR length(v_nick)<2 OR length(v_nick)>24 OR position('#' in v_nick)>0 THEN RAISE EXCEPTION 'El nick debe tener entre 2 y 24 caracteres y no puede contener #' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(lower(v_nick)));
 IF EXISTS(SELECT 1 FROM public.user_profiles WHERE lower(trim(nick))=lower(v_nick) AND user_id<>v_user) THEN RAISE EXCEPTION 'El nick ya está en uso' USING ERRCODE='23505'; END IF;
 SELECT array_agg(id) INTO v_players FROM public.players WHERE auth_user_id=v_user;
 SELECT array_agg(id) INTO v_round_players FROM public.round_players WHERE user_id=v_user OR player_id=ANY(coalesce(v_players,'{}'));
 PERFORM set_config('app.nick_rename','on',true);
 UPDATE public.user_profiles SET nick=v_nick,updated_at=clock_timestamp() WHERE user_id=v_user RETURNING * INTO v_profile;
 IF v_profile.user_id IS NULL THEN RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='P0002'; END IF;
 UPDATE public.players SET name=v_nick WHERE auth_user_id=v_user;
 UPDATE public.round_players SET name=v_nick WHERE user_id=v_user OR player_id=ANY(coalesce(v_players,'{}'));
 UPDATE public.archived_rounds ar SET
  final_ranking=(SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_db_id'=ANY(coalesce(v_players,'{}')::text[]) OR e->>'player_id'=ANY(coalesce(v_round_players,'{}')::text[]) THEN jsonb_set(e,'{player_name}',to_jsonb(v_nick)) ELSE e END ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(ar.final_ranking,'[]')) WITH ORDINALITY x(e,ord)),
  player_stats=(SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_db_id'=ANY(coalesce(v_players,'{}')::text[]) OR e->>'player_id'=ANY(coalesce(v_round_players,'{}')::text[]) THEN jsonb_set(e,'{player_name}',to_jsonb(v_nick)) ELSE e END ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(ar.player_stats,'[]')) WITH ORDINALITY x(e,ord)),
  hole_scores=(SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_db_id'=ANY(coalesce(v_players,'{}')::text[]) OR e->>'player_id'=ANY(coalesce(v_round_players,'{}')::text[]) THEN jsonb_set(e,'{player_name}',to_jsonb(v_nick)) ELSE e END ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(ar.hole_scores,'[]')) WITH ORDINALITY x(e,ord))
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ar.final_ranking,'[]')||coalesce(ar.player_stats,'[]')||coalesce(ar.hole_scores,'[]')) e WHERE e->>'player_db_id'=ANY(coalesce(v_players,'{}')::text[]) OR e->>'player_id'=ANY(coalesce(v_round_players,'{}')::text[]));
 UPDATE public.daily_rankings SET player_name=v_nick WHERE game_player_id=ANY(coalesce(v_players,'{}'));
 INSERT INTO public.group_write_permits(tx,entity,operation) SELECT txid_current(),id,'ledger' FROM public.players WHERE auth_user_id=v_user ON CONFLICT DO NOTHING;
 UPDATE public.handicap_adjustments SET player_name=v_nick WHERE player_id=ANY(coalesce(v_players,'{}'));
 DELETE FROM public.group_write_permits WHERE tx=txid_current() AND operation='ledger';
 PERFORM set_config('app.nick_rename','off',true); RETURN v_profile;
END $$;

REVOKE ALL ON FUNCTION public.rename_my_nick(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rename_my_nick(text) TO authenticated;

COMMIT;
