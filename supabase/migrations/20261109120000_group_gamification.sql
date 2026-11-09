BEGIN;

CREATE TABLE public.group_gamification (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  product_id text NOT NULL CHECK (product_id IN ('no-paso-rojas','spanish-hand','buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos')),
  purchased boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, product_id)
);
ALTER TABLE public.group_gamification ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_gamification TO authenticated;
CREATE POLICY group_gamification_read ON public.group_gamification FOR SELECT TO authenticated USING (public.is_group_member(group_id) OR public.can_manage_group_messages(group_id));
CREATE POLICY group_gamification_manage ON public.group_gamification FOR ALL TO authenticated
USING (public.can_manage_group_messages(group_id)) WITH CHECK (public.can_manage_group_messages(group_id) AND updated_by=auth.uid());

INSERT INTO public.group_gamification(group_id,product_id,purchased,enabled)
SELECT id,'no-paso-rojas',true,hoyo_19_enabled FROM public.groups ON CONFLICT DO NOTHING;
INSERT INTO public.group_gamification(group_id,product_id,purchased,enabled)
SELECT id,'spanish-hand',true,true FROM public.groups ON CONFLICT DO NOTHING;

ALTER TABLE public.round_scores ADD COLUMN gamification_events text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.round_scores ADD CONSTRAINT round_scores_gamification_events_check CHECK (gamification_events <@ ARRAY['buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos']::text[]);

ALTER TABLE public.daily_rankings ADD COLUMN gamification_counts jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.sync_daily_gamification_counts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ranking public.daily_rankings; event_id text; total integer; counts jsonb;
BEGIN
  FOR ranking IN SELECT * FROM public.daily_rankings WHERE group_id=NEW.group_id AND ranking_date=NEW.played_at::date LOOP
    counts:='{}'::jsonb;
    FOREACH event_id IN ARRAY ARRAY['buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos'] LOOP
      SELECT coalesce(sum(coalesce((stat->'gamification_counts'->>event_id)::integer,0)),0) INTO total
      FROM public.archived_rounds ar CROSS JOIN LATERAL jsonb_array_elements(coalesce(ar.player_stats,'[]'::jsonb)) stat
      WHERE ar.group_id=NEW.group_id AND ar.played_at::date=NEW.played_at::date AND stat->>'player_name'=ranking.player_name;
      IF total>0 THEN counts:=counts||jsonb_build_object(event_id,total); END IF;
    END LOOP;
    UPDATE public.daily_rankings SET gamification_counts=counts WHERE id=ranking.id;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER z_sync_daily_gamification_counts AFTER INSERT OR UPDATE OF player_stats ON public.archived_rounds
FOR EACH ROW EXECUTE FUNCTION public.sync_daily_gamification_counts();

CREATE OR REPLACE FUNCTION public.write_verified_round_score(p_score jsonb) RETURNS public.round_scores
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.round_scores; result public.round_scores;
BEGIN
 s:=jsonb_populate_record(NULL::public.round_scores,p_score);
 PERFORM public.require_round_score_writer(s.round_id);
 INSERT INTO public.round_scores(round_id,player_id,hole_number,gross_strokes,strokes_received,net_strokes,stableford_points,
   no_paso_rojas,spanish_hands,gamification_events,abandoned,mode_points,updated_at)
 VALUES(s.round_id,s.player_id,s.hole_number,s.gross_strokes,s.strokes_received,s.net_strokes,s.stableford_points,
   coalesce(s.no_paso_rojas,false),coalesce(s.spanish_hands,false),coalesce(s.gamification_events,'{}'),coalesce(s.abandoned,false),coalesce(s.mode_points,0),now())
 ON CONFLICT(round_id,player_id,hole_number) DO UPDATE SET
  gross_strokes=excluded.gross_strokes,strokes_received=excluded.strokes_received,net_strokes=excluded.net_strokes,
  stableford_points=excluded.stableford_points,no_paso_rojas=excluded.no_paso_rojas,spanish_hands=excluded.spanish_hands,
  gamification_events=excluded.gamification_events,abandoned=excluded.abandoned,mode_points=excluded.mode_points,updated_at=now() RETURNING * INTO result;
 RETURN result;
END $$;

COMMIT;
