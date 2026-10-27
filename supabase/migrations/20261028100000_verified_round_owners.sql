BEGIN;

-- Private capability registry: public round IDs and access codes are not credentials.
CREATE TABLE public.express_owner_credentials (
  owner_id text PRIMARY KEY DEFAULT ('anon_' || gen_random_uuid()::text),
  secret_hash text NOT NULL UNIQUE,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  retired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.express_owner_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.express_owner_credentials FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.register_express_owner(p_secret text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.express_owner_credentials;
BEGIN
  IF auth.uid() IS NOT NULL OR p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Identificación Express no válida' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.express_owner_credentials(secret_hash)
  VALUES(encode(sha256(convert_to(p_secret,'UTF8')),'hex'))
  ON CONFLICT(secret_hash) DO NOTHING;
  SELECT * INTO result FROM public.express_owner_credentials
    WHERE secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex');
  IF result.retired THEN RAISE EXCEPTION 'Identificación ya vinculada a una cuenta' USING ERRCODE='42501'; END IF;
  RETURN result.owner_id;
END $$;

CREATE FUNCTION public.verified_round_actor() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;
BEGIN
  IF auth.uid() IS NOT NULL THEN RETURN auth.uid()::text; END IF;
  secret:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-omiki-express-secret';
  IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  RETURN (SELECT owner_id FROM public.express_owner_credentials
    WHERE secret_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') AND NOT retired);
END $$;

CREATE FUNCTION public.require_round_score_writer(p_round uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.golf_rounds; actor text:=public.verified_round_actor();
BEGIN
  SELECT * INTO r FROM public.golf_rounds WHERE id=p_round FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Partida no encontrada' USING ERRCODE='42501'; END IF;
  IF public.is_app_user_read_only() THEN RAISE EXCEPTION 'Cuenta en modo solo lectura' USING ERRCODE='42501'; END IF;
  IF r.admin_withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'Partida retirada por administración' USING ERRCODE='42501'; END IF;
  IF r.status='completed' AND actor IS DISTINCT FROM r.user_id THEN
    RAISE EXCEPTION 'El creador ya ha finalizado esta partida. Puedes consultar los resultados, pero no modificarlos.' USING ERRCODE='42501';
  END IF;
  IF r.status NOT IN ('active','completed') THEN RAISE EXCEPTION 'Esta partida está cerrada y solo se puede consultar' USING ERRCODE='42501'; END IF;
  IF actor IS NULL OR actor IS DISTINCT FROM r.user_id THEN
    RAISE EXCEPTION 'Solo el creador verificado puede modificar la partida. Las partidas Express antiguas requieren recuperación revisada.' USING ERRCODE='42501';
  END IF;
END $$;

CREATE FUNCTION public.guard_verified_score_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE round_id uuid; participant_round uuid;
BEGIN
  -- Existing, authenticated account-deletion operation only anonymizes historical data.
  IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='UPDATE' AND (NEW.round_id,NEW.player_id,NEW.id) IS DISTINCT FROM (OLD.round_id,OLD.player_id,OLD.id) THEN
    RAISE EXCEPTION 'La identidad del resultado no se puede cambiar' USING ERRCODE='42501';
  END IF;
  round_id:=CASE WHEN TG_OP='DELETE' THEN OLD.round_id ELSE NEW.round_id END;
  -- A parent DELETE already acquired the round lock and passed its owner/manager guard.
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.golf_rounds WHERE id=round_id) THEN RETURN OLD; END IF;
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.round_players WHERE id=OLD.player_id) THEN RETURN OLD; END IF;
  PERFORM public.require_round_score_writer(round_id);
  IF TG_OP<>'DELETE' THEN
    SELECT rp.round_id INTO participant_round FROM public.round_players rp WHERE rp.id=NEW.player_id FOR KEY SHARE;
    IF participant_round IS DISTINCT FROM NEW.round_id THEN RAISE EXCEPTION 'Jugador de otra partida' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER a_verified_score_write BEFORE INSERT OR UPDATE OR DELETE ON public.round_scores
FOR EACH ROW EXECUTE FUNCTION public.guard_verified_score_write();

CREATE FUNCTION public.write_verified_round_score(p_score jsonb) RETURNS public.round_scores
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.round_scores; result public.round_scores;
BEGIN
 s:=jsonb_populate_record(NULL::public.round_scores,p_score);
 PERFORM public.require_round_score_writer(s.round_id);
 INSERT INTO public.round_scores(round_id,player_id,hole_number,gross_strokes,strokes_received,net_strokes,stableford_points,
   no_paso_rojas,spanish_hands,abandoned,mode_points,updated_at)
 VALUES(s.round_id,s.player_id,s.hole_number,s.gross_strokes,s.strokes_received,s.net_strokes,s.stableford_points,
   coalesce(s.no_paso_rojas,false),coalesce(s.spanish_hands,false),coalesce(s.abandoned,false),coalesce(s.mode_points,0),now())
 ON CONFLICT(round_id,player_id,hole_number) DO UPDATE SET
  gross_strokes=excluded.gross_strokes,strokes_received=excluded.strokes_received,net_strokes=excluded.net_strokes,
  stableford_points=excluded.stableford_points,no_paso_rojas=excluded.no_paso_rojas,spanish_hands=excluded.spanish_hands,
  abandoned=excluded.abandoned,mode_points=excluded.mode_points,updated_at=now() RETURNING * INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.delete_verified_round_score(p_round uuid,p_player uuid,p_hole integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.require_round_score_writer(p_round);
 DELETE FROM public.round_scores WHERE round_id=p_round AND player_id=p_player AND hole_number=p_hole;
END $$;

-- A mode-scoring hole may update several players. Archive cannot split that save.
CREATE FUNCTION public.write_verified_hole_scores(p_round uuid,p_hole integer,p_scores jsonb) RETURNS SETOF public.round_scores
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; saved public.round_scores;
BEGIN
 PERFORM public.require_round_score_writer(p_round);
 IF jsonb_typeof(p_scores) IS DISTINCT FROM 'array' OR jsonb_array_length(p_scores) NOT BETWEEN 1 AND 4 THEN
   RAISE EXCEPTION 'Lista de resultados no válida'; END IF;
 IF (SELECT count(DISTINCT e->>'player_id') FROM jsonb_array_elements(p_scores) e)<>jsonb_array_length(p_scores) THEN
   RAISE EXCEPTION 'Jugador repetido en los resultados'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_scores) LOOP
   IF (item->>'round_id')::uuid IS DISTINCT FROM p_round OR (item->>'hole_number')::integer IS DISTINCT FROM p_hole THEN
     RAISE EXCEPTION 'Resultados de otra partida u hoyo'; END IF;
   saved:=public.write_verified_round_score(item);
   RETURN NEXT saved;
 END LOOP;
END $$;

CREATE FUNCTION public.guard_verified_round_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=public.verified_round_actor(); admin_op boolean; manager boolean;
BEGIN
  IF public.is_app_user_read_only() THEN RAISE EXCEPTION 'Cuenta en modo solo lectura' USING ERRCODE='42501'; END IF;
  IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  admin_op:=current_setting('app.verified_admin_round',true)='on' AND EXISTS(
    SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid() AND status='active');
  IF admin_op THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='INSERT' THEN
    IF actor IS NULL OR NEW.user_id IS DISTINCT FROM actor OR NEW.status<>'active' THEN
      RAISE EXCEPTION 'Creador de partida no verificado' USING ERRCODE='42501';
    END IF;
    IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Creador de partida no verificado' USING ERRCODE='42501'; END IF;
    IF NEW.group_id IS NOT NULL AND NOT (auth.uid() IS NOT NULL AND
      (public.is_group_member(NEW.group_id) OR public.can_manage_group_messages(NEW.group_id))) THEN
      RAISE EXCEPTION 'No perteneces a este grupo' USING ERRCODE='42501'; END IF;
    IF auth.uid() IS NULL THEN
      IF NEW.group_id IS NOT NULL THEN RAISE EXCEPTION 'Express no puede crear partidas de grupo' USING ERRCODE='42501'; END IF;
      -- Same lock is acquired by secure claim; count and insertion are serialized.
      PERFORM 1 FROM public.express_owner_credentials WHERE owner_id=actor AND NOT retired FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Identificación Express no disponible' USING ERRCODE='42501'; END IF;
    END IF;
    IF NEW.group_id IS NULL THEN
      IF auth.uid() IS NOT NULL THEN PERFORM 1 FROM auth.users WHERE id=auth.uid() FOR UPDATE; END IF;
      -- Match effectivePlan, including a live Team trial and indefinite paid plans.
      IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_subscriptions s WHERE s.user_id=auth.uid()
        AND s.status='active' AND ((s.team_trial_ends_at IS NOT NULL AND s.team_trial_ends_at>now()) OR
          (s.plan_type IN ('player','team','premium') AND (s.current_period_end IS NULL OR s.current_period_end>now())))) THEN
        IF (SELECT count(*) FROM public.golf_rounds WHERE user_id=actor AND group_id IS NULL AND admin_withdrawn_at IS NULL)>=4 THEN
          RAISE EXCEPTION 'Has alcanzado el límite de 4 partidas Express' USING ERRCODE='42501'; END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF auth.uid() IS NOT NULL AND NEW.user_id=auth.uid()::text AND
      current_setting('app.verified_claim_owner',true)=OLD.user_id THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'El creador de la partida no se puede cambiar' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'El grupo de la partida no se puede cambiar' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'La referencia al creador no se puede cambiar' USING ERRCODE='42501'; END IF;
  manager:=OLD.group_id IS NOT NULL AND public.can_manage_group_messages(OLD.group_id);
  -- Keep established group-manager delete/archive operations; not score editing or completion.
  IF TG_OP='DELETE' AND manager THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND manager AND OLD.status IN ('active','completed') AND NEW.status IN ('deleted','archived')
    AND (to_jsonb(NEW)-ARRAY['status','updated_at'])=(to_jsonb(OLD)-ARRAY['status','updated_at']) THEN RETURN NEW; END IF;
  IF actor IS NULL OR actor IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Solo el creador verificado puede modificar la partida' USING ERRCODE='42501'; END IF;
  IF OLD.admin_withdrawn_at IS NOT NULL OR OLD.status NOT IN ('active','completed') THEN RAISE EXCEPTION 'Esta partida está cerrada y solo se puede consultar' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND NOT (NEW.status=OLD.status OR (OLD.status='active' AND NEW.status='completed')
     OR (OLD.status='completed' AND NEW.status='archived') OR NEW.status='deleted') THEN
    RAISE EXCEPTION 'Cambio de estado no permitido' USING ERRCODE='42501';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER a_verified_round_write BEFORE INSERT OR UPDATE OR DELETE ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_verified_round_write();

-- A verified claim transfers ownership only; it must neither restore nor lose withdrawn history.
CREATE OR REPLACE FUNCTION public.guard_round_admin_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_is_admin boolean:=EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid() AND status='active');
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND auth.uid() IS NOT NULL AND OLD.group_id IS NULL
   AND current_setting('app.verified_claim_owner',true)=OLD.user_id AND NEW.user_id=auth.uid()::text
   AND (to_jsonb(NEW)-ARRAY['user_id','updated_at'])=(to_jsonb(OLD)-ARRAY['user_id','updated_at']) THEN
   NEW.updated_at:=clock_timestamp(); RETURN NEW;
 END IF;
 IF NOT actor_is_admin THEN
   IF TG_OP='INSERT' THEN
     IF NEW.admin_withdrawn_at IS NOT NULL OR NEW.admin_previous_status IS NOT NULL THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
   ELSE
     IF NEW.admin_withdrawn_at IS DISTINCT FROM OLD.admin_withdrawn_at OR NEW.admin_previous_status IS DISTINCT FROM OLD.admin_previous_status OR OLD.admin_withdrawn_at IS NOT NULL THEN
       RAISE EXCEPTION 'Partida retirada por administración' USING ERRCODE='42501'; END IF;
   END IF;
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;

CREATE FUNCTION public.guard_verified_round_player_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.golf_rounds; target uuid; actor text:=public.verified_round_actor();
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.round_id,NEW.player_id) IS DISTINCT FROM (OLD.id,OLD.round_id,OLD.player_id) THEN
   RAISE EXCEPTION 'La identidad de la participación no se puede cambiar' USING ERRCODE='42501'; END IF;
 -- Existing server-only operations retain their narrower identity and consent guards.
 IF TG_OP='UPDATE' AND (current_setting('app.nick_rename',true)='on' OR current_setting('app.quick_round_consent',true)='on') THEN RETURN NEW; END IF;
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.round_id ELSE NEW.round_id END;
 SELECT * INTO r FROM public.golf_rounds WHERE id=target FOR UPDATE;
 IF TG_OP='DELETE' AND r.id IS NULL THEN RETURN OLD; END IF;
 IF r.id IS NULL OR r.admin_withdrawn_at IS NOT NULL OR r.status NOT IN ('active','completed') THEN
   RAISE EXCEPTION 'Esta partida está cerrada y solo se puede consultar' USING ERRCODE='42501'; END IF;
 IF r.status='completed' AND (actor IS NULL OR actor IS DISTINCT FROM r.user_id) THEN
   RAISE EXCEPTION 'El creador ya ha finalizado esta partida. Puedes consultar los resultados, pero no modificarlos.' USING ERRCODE='42501'; END IF;
 IF public.is_app_user_read_only() OR ((actor IS NULL OR actor IS DISTINCT FROM r.user_id)
    AND NOT (r.group_id IS NOT NULL AND public.can_manage_group_messages(r.group_id))) THEN
   RAISE EXCEPTION 'No tienes permiso para modificar los jugadores de esta partida' USING ERRCODE='42501'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER a_verified_round_player_write BEFORE INSERT OR UPDATE OR DELETE ON public.round_players
FOR EACH ROW EXECUTE FUNCTION public.guard_verified_round_player_write();

-- p_actor remains in the signature for compatibility, but is never proof of identity.
CREATE OR REPLACE FUNCTION public.express_round_actor(p_actor text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.verified_round_actor() $$;
CREATE OR REPLACE FUNCTION public.guard_express_round_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.status='active' AND NEW.status='completed' AND public.verified_round_actor() IS DISTINCT FROM OLD.user_id
    AND NOT (current_setting('app.verified_admin_round',true)='on' AND EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid() AND status='active')) THEN
   RAISE EXCEPTION 'Solo el creador puede finalizar la partida' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.finish_round(p_round uuid,p_actor text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.require_round_score_writer(p_round);
 IF (SELECT status FROM public.golf_rounds WHERE id=p_round)<>'active' THEN
   RAISE EXCEPTION 'La partida ya está finalizada' USING ERRCODE='42501';
 END IF;
 UPDATE public.golf_rounds SET status='completed',completed_at=now(),updated_at=now() WHERE id=p_round;
END $$;
CREATE OR REPLACE FUNCTION public.finish_express_round(p_round uuid,p_actor text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.finish_round(p_round,NULL) $$;

-- Old identifier-only claims cannot prove ownership, even after signing in.
CREATE OR REPLACE FUNCTION public.claim_device_rounds(p_device_id text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Las partidas Express antiguas requieren recuperación revisada' USING ERRCODE='42501'; END $$;

CREATE FUNCTION public.claim_verified_express_rounds(p_secret text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE credential public.express_owner_credentials; moved integer;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() OR EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid()) THEN
   RAISE EXCEPTION 'Cuenta sin permiso para recuperar partidas' USING ERRCODE='42501'; END IF;
 IF p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Identificación Express no válida' USING ERRCODE='42501'; END IF;
 SELECT * INTO credential FROM public.express_owner_credentials
  WHERE secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') FOR UPDATE;
 IF credential.owner_id IS NULL OR (credential.retired AND credential.claimed_by IS DISTINCT FROM auth.uid()) THEN
   RAISE EXCEPTION 'Identificación Express no disponible' USING ERRCODE='42501'; END IF;
 IF credential.claimed_by=auth.uid() THEN RETURN 0; END IF;
 PERFORM 1 FROM auth.users WHERE id=auth.uid() FOR UPDATE;
 PERFORM set_config('app.verified_claim_owner',credential.owner_id,true);
 UPDATE public.golf_rounds SET user_id=auth.uid()::text,updated_at=now() WHERE user_id=credential.owner_id AND group_id IS NULL;
 GET DIAGNOSTICS moved=ROW_COUNT;
 IF to_regclass('public.completed_rounds_summary') IS NOT NULL THEN
  EXECUTE 'UPDATE public.completed_rounds_summary SET user_id=$1 WHERE user_id=$2' USING auth.uid()::text,credential.owner_id;
 END IF;
 UPDATE public.express_owner_credentials SET claimed_by=auth.uid(),retired=true WHERE owner_id=credential.owner_id;
 PERFORM set_config('app.verified_claim_owner','',true);
 RETURN moved;
END $$;

-- Preserve the audited administration endpoint, never give admins a blanket score bypass.
ALTER FUNCTION public.admin_change_app_round(uuid,text,text,timestamptz) RENAME TO admin_change_app_round_before_owner_guard;
REVOKE ALL ON FUNCTION public.admin_change_app_round_before_owner_guard(uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_change_app_round(p_round_id uuid,p_action text,p_reason text,p_expected timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid() AND status='active') THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.verified_admin_round','on',true);
 result:=public.admin_change_app_round_before_owner_guard(p_round_id,p_action,p_reason,p_expected);
 PERFORM set_config('app.verified_admin_round','off',true);
 RETURN result;
END $$;

-- Never expose bypass helpers as PostgREST RPCs.
REVOKE ALL ON FUNCTION public.register_express_owner(text),public.verified_round_actor(),public.require_round_score_writer(uuid),
 public.guard_verified_score_write(),public.guard_verified_round_write(),public.guard_verified_round_player_write(),public.claim_verified_express_rounds(text),
 public.guard_round_admin_fields(),public.guard_express_round_completion(),
 public.write_verified_round_score(jsonb),public.delete_verified_round_score(uuid,uuid,integer),
 public.write_verified_hole_scores(uuid,integer,jsonb),
 public.admin_change_app_round(uuid,text,text,timestamptz)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_express_owner(text) TO anon;
GRANT EXECUTE ON FUNCTION public.write_verified_round_score(jsonb),public.delete_verified_round_score(uuid,uuid,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.write_verified_hole_scores(uuid,integer,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_verified_express_rounds(text),public.admin_change_app_round(uuid,text,text,timestamptz) TO authenticated;
-- These existing endpoints now verify request identity rather than p_actor.
GRANT EXECUTE ON FUNCTION public.finish_round(uuid,text),public.finish_express_round(uuid,text) TO anon,authenticated;

-- These privileges are unnecessary to the application and can bypass row triggers.
REVOKE TRUNCATE,TRIGGER,REFERENCES ON public.round_scores,public.golf_rounds,public.round_players FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
