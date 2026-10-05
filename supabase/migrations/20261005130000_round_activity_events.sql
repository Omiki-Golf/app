BEGIN;

CREATE TABLE public.round_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.golf_rounds(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  round_player_id uuid NOT NULL REFERENCES public.round_players(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('hole_in_one','no_paso_rojas','spanish_hands')),
  player_name text NOT NULL,
  hole_number integer NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, round_player_id, hole_number, event_type)
);
CREATE INDEX round_activity_events_round_recent ON public.round_activity_events(round_id,created_at DESC);
CREATE INDEX round_activity_events_group_recent ON public.round_activity_events(group_id,created_at DESC) WHERE group_id IS NOT NULL;
ALTER TABLE public.round_activity_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.round_activity_cursors (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK(scope_type IN ('round','group')),
  scope_id uuid NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,scope_type,scope_id)
);
ALTER TABLE public.round_activity_cursors ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.sync_round_activity_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.round_players; r public.golf_rounds; event_name text; enabled boolean;
BEGIN
 SELECT * INTO p FROM public.round_players WHERE id=NEW.player_id;
 SELECT * INTO r FROM public.golf_rounds WHERE id=NEW.round_id;
 IF p.id IS NULL OR r.id IS NULL THEN RETURN NEW; END IF;
 FOREACH event_name IN ARRAY ARRAY['hole_in_one','no_paso_rojas','spanish_hands'] LOOP
  enabled:=CASE event_name WHEN 'hole_in_one' THEN NOT NEW.abandoned AND NEW.gross_strokes=1 WHEN 'no_paso_rojas' THEN NEW.no_paso_rojas WHEN 'spanish_hands' THEN NEW.spanish_hands END;
  IF enabled THEN
   INSERT INTO public.round_activity_events(round_id,group_id,round_player_id,event_type,player_name,hole_number)
   VALUES(NEW.round_id,r.group_id,NEW.player_id,event_name,p.name,NEW.hole_number)
   ON CONFLICT(round_id,round_player_id,hole_number,event_type) DO UPDATE SET player_name=excluded.player_name,group_id=excluded.group_id;
  ELSE
   DELETE FROM public.round_activity_events WHERE round_id=NEW.round_id AND round_player_id=NEW.player_id AND hole_number=NEW.hole_number AND event_type=event_name;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_round_activity_event_after_score
AFTER INSERT OR UPDATE OF gross_strokes,abandoned,no_paso_rojas,spanish_hands ON public.round_scores
FOR EACH ROW EXECUTE FUNCTION public.sync_round_activity_event();

CREATE FUNCTION public.round_activity_inbox(
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
 ELSE
  SELECT EXISTS(SELECT 1 FROM public.golf_rounds r WHERE r.id=p_round AND r.group_id IS NULL
   AND (r.access_code=p_access_code OR (auth.uid() IS NOT NULL AND r.user_id=auth.uid()::text))) INTO allowed;
  scope_kind:='round'; scope:=p_round;
 END IF;
 IF NOT allowed THEN RAISE EXCEPTION 'No tienes acceso a esta actividad' USING ERRCODE='42501'; END IF;
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

REVOKE ALL ON public.round_activity_events,public.round_activity_cursors FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_round_activity_event(),public.round_activity_inbox(uuid,uuid,text,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.round_activity_inbox(uuid,uuid,text,timestamptz,boolean) TO anon,authenticated;

COMMIT;
