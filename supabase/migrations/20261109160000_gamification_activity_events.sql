BEGIN;

-- Notificaciones de "Actividad de juego" también para los títulos del Pro-Shop
-- (antes solo hoyo en uno, No pasó de rojas y Spanish Hands).
ALTER TABLE public.round_activity_events DROP CONSTRAINT IF EXISTS round_activity_events_event_type_check;
ALTER TABLE public.round_activity_events ADD CONSTRAINT round_activity_events_event_type_check CHECK (event_type IN (
  'hole_in_one','no_paso_rojas','spanish_hands',
  'buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos'
));

CREATE OR REPLACE FUNCTION public.sync_round_activity_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.round_players; r public.golf_rounds; event_name text; enabled boolean;
BEGIN
 SELECT * INTO p FROM public.round_players WHERE id=NEW.player_id;
 SELECT * INTO r FROM public.golf_rounds WHERE id=NEW.round_id;
 IF p.id IS NULL OR r.id IS NULL THEN RETURN NEW; END IF;
 FOREACH event_name IN ARRAY ARRAY[
   'hole_in_one','no_paso_rojas','spanish_hands',
   'buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos'
 ] LOOP
  enabled:=CASE event_name
   WHEN 'hole_in_one' THEN NOT NEW.abandoned AND NEW.gross_strokes=1
   WHEN 'no_paso_rojas' THEN coalesce(NEW.no_paso_rojas,false)
   WHEN 'spanish_hands' THEN coalesce(NEW.spanish_hands,false)
   ELSE event_name = ANY(coalesce(NEW.gamification_events,'{}'::text[]))
  END;
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

DROP TRIGGER IF EXISTS sync_round_activity_event_after_score ON public.round_scores;
CREATE TRIGGER sync_round_activity_event_after_score
AFTER INSERT OR UPDATE OF gross_strokes,abandoned,no_paso_rojas,spanish_hands,gamification_events ON public.round_scores
FOR EACH ROW EXECUTE FUNCTION public.sync_round_activity_event();

-- Marcas del Pro-Shop ya hechas en partidas que siguen en round_scores.
INSERT INTO public.round_activity_events(round_id,group_id,round_player_id,event_type,player_name,hole_number,created_at)
SELECT s.round_id, r.group_id, s.player_id, ev, p.name, s.hole_number, coalesce(s.updated_at, now())
FROM public.round_scores s
JOIN public.golf_rounds r ON r.id=s.round_id
JOIN public.round_players p ON p.id=s.player_id
CROSS JOIN LATERAL unnest(s.gamification_events) ev
WHERE ev IN ('buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos')
ON CONFLICT(round_id,round_player_id,hole_number,event_type) DO NOTHING;

COMMIT;
