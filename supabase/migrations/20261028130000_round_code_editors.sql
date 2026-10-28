BEGIN;

-- Access codes stop being public data. They move to a private table and become an editing
-- credential: whoever has the code of an active round can enter scores, while finishing,
-- archiving, deleting and roster/course changes stay with the verified creator.
CREATE TABLE public.round_access_codes (
  round_id uuid PRIMARY KEY REFERENCES public.golf_rounds(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  code text NOT NULL
);
CREATE INDEX round_access_codes_code ON public.round_access_codes(code);
ALTER TABLE public.round_access_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.round_access_codes FROM PUBLIC,anon,authenticated;

-- Failed code attempts per client, so 4-digit codes cannot be enumerated.
CREATE TABLE public.round_code_attempts (
  id bigserial PRIMARY KEY,
  client_key text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX round_code_attempts_client ON public.round_code_attempts(client_key,attempted_at);
ALTER TABLE public.round_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.round_code_attempts FROM PUBLIC,anon,authenticated;

INSERT INTO public.round_access_codes(round_id,code)
SELECT id,upper(trim(access_code)) FROM public.golf_rounds WHERE nullif(trim(access_code),'') IS NOT NULL
ON CONFLICT (round_id) DO NOTHING;

ALTER TABLE public.golf_rounds ALTER COLUMN access_code DROP NOT NULL;
-- One-off data move: the row guards are for client writes, not for this migration.
ALTER TABLE public.golf_rounds DISABLE TRIGGER USER;
UPDATE public.golf_rounds SET access_code=NULL WHERE access_code IS NOT NULL;
ALTER TABLE public.golf_rounds ENABLE TRIGGER USER;

-- New rounds: keep the client's code unless another active round uses it, store it privately
-- and never leave it in the public row.
CREATE FUNCTION public.stash_round_access_code() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v text:=upper(trim(NEW.access_code)); tries integer:=0;
BEGIN
 IF TG_OP='UPDATE' AND NEW.access_code IS NULL THEN RETURN NEW; END IF;
 WHILE v IS NULL OR v='' OR EXISTS(SELECT 1 FROM public.round_access_codes c JOIN public.golf_rounds g ON g.id=c.round_id
   WHERE c.code=v AND g.status='active' AND g.id<>NEW.id) LOOP
  tries:=tries+1;
  IF tries>50 THEN RAISE EXCEPTION 'No se pudo generar un código único. Por favor intenta de nuevo.'; END IF;
  v:=(1000+floor(random()*9000))::integer::text;
 END LOOP;
 INSERT INTO public.round_access_codes(round_id,code) VALUES(NEW.id,v)
 ON CONFLICT (round_id) DO UPDATE SET code=excluded.code;
 NEW.access_code:=NULL;
 RETURN NEW;
END $$;
-- Runs after the a_* guards, which validate the original row.
CREATE TRIGGER zz_stash_round_access_code BEFORE INSERT OR UPDATE OF access_code ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.stash_round_access_code();

CREATE FUNCTION public.round_code_client_key() RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(
  nullif(trim(split_part(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-forwarded-for',''),',',1)),''),
  nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'cf-connecting-ip',''),
  'unknown')
$$;

CREATE FUNCTION public.check_round_code_budget() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text:=public.round_code_client_key();
BEGIN
 IF (SELECT count(*) FROM public.round_code_attempts WHERE client_key=k AND attempted_at>now()-interval '15 minutes')
    >= (CASE WHEN k='unknown' THEN 300 ELSE 30 END) THEN
  RAISE EXCEPTION 'Demasiados intentos con códigos incorrectos. Espera unos minutos.' USING ERRCODE='42501';
 END IF;
END $$;

-- Callers must not raise afterwards, or the recorded failure is rolled back.
CREATE FUNCTION public.record_round_code_failure() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text:=public.round_code_client_key();
BEGIN
 INSERT INTO public.round_code_attempts(client_key) VALUES(k);
 DELETE FROM public.round_code_attempts WHERE client_key=k AND attempted_at<now()-interval '1 day';
END $$;

CREATE FUNCTION public.round_code_matches(p_round uuid,p_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT nullif(trim(p_code),'') IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.round_access_codes WHERE round_id=p_round AND code=upper(trim(p_code)))
$$;

-- The creator (or the group, for group rounds) can read the code to share it.
CREATE FUNCTION public.get_round_access_code(p_round uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.golf_rounds;
BEGIN
 SELECT * INTO r FROM public.golf_rounds WHERE id=p_round;
 IF r.id IS NULL OR NOT (public.verified_round_actor() IS NOT DISTINCT FROM r.user_id
    OR (r.group_id IS NOT NULL AND auth.uid() IS NOT NULL
        AND (public.is_group_member(r.group_id) OR public.can_manage_group_messages(r.group_id)))) THEN
  RETURN NULL;
 END IF;
 RETURN (SELECT code FROM public.round_access_codes WHERE round_id=r.id);
END $$;

CREATE FUNCTION public.find_active_round_by_code(p_code text,p_group uuid DEFAULT NULL,p_search_all boolean DEFAULT false)
RETURNS SETOF public.golf_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE found public.golf_rounds;
BEGIN
 PERFORM public.check_round_code_budget();
 SELECT g.* INTO found FROM public.golf_rounds g JOIN public.round_access_codes c ON c.round_id=g.id
 WHERE c.code=upper(trim(coalesce(p_code,''))) AND g.status='active' AND g.admin_withdrawn_at IS NULL
   AND (p_search_all OR g.group_id IS NOT DISTINCT FROM p_group)
 ORDER BY g.created_at DESC LIMIT 1;
 IF found.id IS NULL THEN PERFORM public.record_round_code_failure(); RETURN; END IF;
 RETURN NEXT found;
END $$;

CREATE FUNCTION public.verify_round_access_code(p_round uuid,p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.check_round_code_budget();
 IF public.round_code_matches(p_round,p_code) THEN RETURN true; END IF;
 PERFORM public.record_round_code_failure();
 RETURN false;
END $$;

-- Same checks as before, plus the code editor allowance while the round is active.
CREATE OR REPLACE FUNCTION public.require_round_score_writer(p_round uuid) RETURNS void
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
  -- Set only by the *_by_code functions below, after checking the code, for this round.
  IF r.status='active' AND current_setting('app.round_code_writer',true)=p_round::text THEN RETURN; END IF;
  IF actor IS NULL OR actor IS DISTINCT FROM r.user_id THEN
    RAISE EXCEPTION 'Solo el creador verificado puede modificar la partida. Las partidas Express antiguas requieren recuperación revisada.' USING ERRCODE='42501';
  END IF;
END $$;

CREATE FUNCTION public.write_round_hole_scores_by_code(p_round uuid,p_hole integer,p_scores jsonb,p_access_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved jsonb;
BEGIN
 PERFORM public.check_round_code_budget();
 IF NOT public.round_code_matches(p_round,p_access_code) THEN
  PERFORM public.record_round_code_failure();
  RETURN jsonb_build_object('ok',false,'error','Código de acceso incorrecto');
 END IF;
 PERFORM set_config('app.round_code_writer',p_round::text,true);
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) INTO saved FROM public.write_verified_hole_scores(p_round,p_hole,p_scores) s;
 PERFORM set_config('app.round_code_writer','',true);
 RETURN jsonb_build_object('ok',true,'scores',saved);
END $$;

CREATE FUNCTION public.delete_round_score_by_code(p_round uuid,p_player uuid,p_hole integer,p_access_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.check_round_code_budget();
 IF NOT public.round_code_matches(p_round,p_access_code) THEN
  PERFORM public.record_round_code_failure();
  RETURN jsonb_build_object('ok',false,'error','Código de acceso incorrecto');
 END IF;
 PERFORM set_config('app.round_code_writer',p_round::text,true);
 PERFORM public.delete_verified_round_score(p_round,p_player,p_hole);
 PERFORM set_config('app.round_code_writer','',true);
 RETURN jsonb_build_object('ok',true);
END $$;

-- Existing code-based functions now read the private table.
CREATE OR REPLACE FUNCTION public.register_express_round_access(p_round uuid,p_access_code text,p_actor text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.golf_rounds; actor text:=public.express_round_actor(p_actor);
BEGIN
 SELECT * INTO r FROM public.golf_rounds WHERE id=p_round;
 IF r.id IS NULL OR r.group_id IS NOT NULL OR r.status<>'active' THEN RAISE EXCEPTION 'La partida Express no está disponible'; END IF;
 IF actor IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 PERFORM public.check_round_code_budget();
 IF NOT public.round_code_matches(r.id,p_access_code) THEN PERFORM public.record_round_code_failure(); RETURN; END IF;
 IF actor=r.user_id THEN RETURN; END IF;
 INSERT INTO public.express_round_participants(round_id,user_id) VALUES(r.id,actor) ON CONFLICT (round_id,user_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.get_express_round_statistics_by_code(p_access_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.golf_rounds;
  result jsonb;
BEGIN
  IF nullif(trim(p_access_code), '') IS NULL OR length(trim(p_access_code)) > 32 THEN
    RETURN NULL;
  END IF;
  PERFORM public.check_round_code_budget();

  SELECT g.* INTO r
  FROM public.golf_rounds g JOIN public.round_access_codes c ON c.round_id = g.id
  WHERE c.code = upper(trim(p_access_code))
    AND g.group_id IS NULL
    AND g.status IN ('completed', 'archived')
    AND g.admin_withdrawn_at IS NULL
  ORDER BY g.completed_at DESC NULLS LAST
  LIMIT 1;

  IF r.id IS NULL THEN PERFORM public.record_round_code_failure(); RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'round', jsonb_build_object(
      'id', r.id,
      'course_id', r.course_id,
      'num_holes', r.num_holes,
      'holes_range', r.holes_range,
      'use_slope', r.use_slope,
      'game_mode', r.game_mode,
      'status', r.status,
      'reference_number', r.reference_number,
      'created_at', r.created_at,
      'completed_at', r.completed_at
    ),
    'course', to_jsonb(c),
    'players', coalesce((
      SELECT jsonb_agg((to_jsonb(rp) - 'user_id' - 'player_id') ORDER BY rp.created_at, rp.id)
      FROM public.round_players rp WHERE rp.round_id = r.id
    ), '[]'::jsonb),
    'scores', coalesce((
      SELECT jsonb_agg(to_jsonb(rs) ORDER BY rs.hole_number, rs.player_id)
      FROM public.round_scores rs WHERE rs.round_id = r.id
    ), '[]'::jsonb),
    'holes', coalesce((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hole_number)
      FROM public.golf_holes h
      WHERE h.course_id = r.course_id
        AND (
          (r.num_holes = 9 AND r.holes_range = '10-18' AND h.hole_number BETWEEN 10 AND 18)
          OR (NOT (r.num_holes = 9 AND r.holes_range = '10-18') AND h.hole_number <= r.num_holes)
        )
    ), '[]'::jsonb),
    'isCreator', false,
    'accessMode', 'code'
  ) INTO result
  FROM public.golf_courses c
  WHERE c.id = r.course_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.round_activity_inbox(
 p_round uuid DEFAULT NULL,
 p_group uuid DEFAULT NULL,
 p_access_code text DEFAULT NULL,
 p_since timestamptz DEFAULT NULL,
 p_mark_read boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean:=false; scope_kind text; scope uuid; cursor_at timestamptz; result jsonb;
BEGIN
 IF (p_round IS NULL)=(p_group IS NULL) THEN RAISE EXCEPTION 'Indica una partida o un Team'; END IF;
 IF p_group IS NOT NULL THEN
  allowed:=auth.uid() IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.groups g WHERE g.id=p_group AND (g.user_auth_id=auth.uid() OR EXISTS(
    SELECT 1 FROM public.group_members gm WHERE gm.group_id=g.id AND gm.user_id=auth.uid())));
  scope_kind:='group'; scope:=p_group;
  IF NOT allowed THEN RAISE EXCEPTION 'No tienes acceso a esta actividad' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT EXISTS(SELECT 1 FROM public.golf_rounds r WHERE r.id=p_round AND r.group_id IS NULL
   AND auth.uid() IS NOT NULL AND r.user_id=auth.uid()::text) INTO allowed;
  IF NOT allowed AND EXISTS(SELECT 1 FROM public.golf_rounds r WHERE r.id=p_round AND r.group_id IS NULL) THEN
   PERFORM public.check_round_code_budget();
   allowed:=public.round_code_matches(p_round,p_access_code);
   IF NOT allowed THEN PERFORM public.record_round_code_failure(); END IF;
  END IF;
  scope_kind:='round'; scope:=p_round;
  -- No raise here: it would roll back the recorded failure.
  IF NOT allowed THEN RETURN jsonb_build_object('events','[]'::jsonb,'unread',0,'server_time',now(),'denied',true); END IF;
 END IF;
 IF auth.uid() IS NOT NULL THEN
  SELECT last_seen_at INTO cursor_at FROM public.round_activity_cursors WHERE user_id=auth.uid() AND scope_type=scope_kind AND scope_id=scope;
 ELSE cursor_at:=p_since; END IF;
 WITH visible AS (
  SELECT e.* FROM public.round_activity_events e
  WHERE (scope_kind='round' AND e.round_id=scope) OR (scope_kind='group' AND e.group_id=scope)
 ), recent AS (SELECT * FROM visible ORDER BY created_at DESC,id LIMIT 50)
 SELECT jsonb_build_object(
  'events',coalesce((SELECT jsonb_agg(to_jsonb(recent) ORDER BY created_at DESC,id) FROM recent),'[]'::jsonb),
  'unread',(SELECT count(*) FROM visible WHERE cursor_at IS NULL OR created_at>cursor_at),
  'server_time',now()
 ) INTO result;
 IF p_mark_read AND auth.uid() IS NOT NULL THEN
  INSERT INTO public.round_activity_cursors(user_id,scope_type,scope_id,last_seen_at) VALUES(auth.uid(),scope_kind,scope,now())
  ON CONFLICT(user_id,scope_type,scope_id) DO UPDATE SET last_seen_at=excluded.last_seen_at;
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.stash_round_access_code(),public.round_code_client_key(),public.check_round_code_budget(),
 public.record_round_code_failure(),public.round_code_matches(uuid,text),public.require_round_score_writer(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_round_access_code(uuid),public.find_active_round_by_code(text,uuid,boolean),
 public.verify_round_access_code(uuid,text),public.write_round_hole_scores_by_code(uuid,integer,jsonb,text),
 public.delete_round_score_by_code(uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_round_access_code(uuid),public.find_active_round_by_code(text,uuid,boolean),
 public.verify_round_access_code(uuid,text),public.write_round_hole_scores_by_code(uuid,integer,jsonb,text),
 public.delete_round_score_by_code(uuid,uuid,integer,text) TO anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
