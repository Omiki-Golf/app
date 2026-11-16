-- Varias partidas de grupo el mismo día ya no se suman siempre en una sola clasificación.
-- Cada partida archivada lleva una "jornada" (ranking_session) dentro de su día:
--  · misma jornada  → se suman (2ª vuelta de 9 hoyos o salidas simultáneas);
--  · jornada nueva  → clasificación y cervezas aparte.
-- Las partidas y clasificaciones existentes quedan en la jornada 1, como hasta ahora.
BEGIN;

ALTER TABLE public.archived_rounds
  ADD COLUMN IF NOT EXISTS ranking_session smallint NOT NULL DEFAULT 1;
ALTER TABLE public.archived_rounds DROP CONSTRAINT IF EXISTS archived_rounds_ranking_session_check;
ALTER TABLE public.archived_rounds
  ADD CONSTRAINT archived_rounds_ranking_session_check CHECK (ranking_session BETWEEN 1 AND 50);

ALTER TABLE public.daily_rankings
  ADD COLUMN IF NOT EXISTS ranking_session smallint NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS public.daily_rankings_legacy_identity;
DROP INDEX IF EXISTS public.daily_rankings_account_identity;
CREATE UNIQUE INDEX daily_rankings_legacy_identity
  ON public.daily_rankings(group_id,ranking_date,ranking_session,player_name) WHERE game_player_id IS NULL;
CREATE UNIQUE INDEX daily_rankings_account_identity
  ON public.daily_rankings(group_id,ranking_date,ranking_session,game_player_id) WHERE game_player_id IS NOT NULL;

-- La vista de estadísticas expone la jornada (columna nueva al final).
CREATE OR REPLACE VIEW public.group_statistics_rounds WITH (security_invoker=true) AS
SELECT ar.id,ar.group_id,ar.course_name,ar.played_at,ar.archived_at,ar.season_id,ar.handicap_adjusted,ar.source_round_id,
 ranking.value AS final_ranking,stats.value AS player_stats,holes.value AS hole_scores,ar.ranking_session
FROM public.archived_rounds ar
CROSS JOIN LATERAL (
 SELECT coalesce(jsonb_agg(f || jsonb_build_object('position',position,'player_id',public.statistics_player_id(ar.group_id,f)) ORDER BY position),'[]') AS value
 FROM (
   SELECT f,row_number() OVER(ORDER BY ord) AS position FROM jsonb_array_elements(coalesce(ar.final_ranking,'[]')) WITH ORDINALITY f(f,ord)
   WHERE NOT coalesce((f->>'is_guest')::boolean,false)
 ) members
) ranking
CROSS JOIN LATERAL (
 SELECT coalesce(jsonb_agg(ps || jsonb_build_object('player_id',public.statistics_player_id(ar.group_id,ps),
   'beers_won',CASE WHEN (f->>'position')::int<=floor(jsonb_array_length(ranking.value)/2.0) THEN 1 ELSE 0 END,
   'beers_paid',CASE WHEN (f->>'position')::int>ceil(jsonb_array_length(ranking.value)/2.0) THEN 1 ELSE 0 END) ORDER BY ord),'[]') AS value
 FROM jsonb_array_elements(coalesce(ar.player_stats,'[]')) WITH ORDINALITY ps(ps,ord)
 JOIN jsonb_array_elements(ranking.value) f ON public.statistics_player_id(ar.group_id,ps)::text=f->>'player_id'
 WHERE NOT coalesce((ps->>'is_guest')::boolean,false)
) stats
CROSS JOIN LATERAL (
 SELECT coalesce(jsonb_agg(h || jsonb_build_object('player_id',public.statistics_player_id(ar.group_id,h)) ORDER BY ord),'[]') AS value
 FROM jsonb_array_elements(coalesce(ar.hole_scores,'[]')) WITH ORDINALITY h(h,ord)
 WHERE NOT coalesce((h->>'is_guest')::boolean,false)
) holes
WHERE jsonb_array_length(ranking.value)>0;
GRANT SELECT ON public.group_statistics_rounds TO anon,authenticated;

-- Clasificación de una jornada concreta: misma lógica que la diaria anterior, filtrada por jornada.
CREATE OR REPLACE FUNCTION public.calculate_daily_ranking_session(p_group_id uuid, p_date date, p_session smallint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM daily_rankings
  WHERE group_id = p_group_id
    AND ranking_date = p_date
    AND ranking_session = p_session;

  WITH player_totals AS (
    SELECT
      p_group_id as group_id,
      p_date as ranking_date,
      max((elem->>'player_name')::text) as player_name,
      linked.id as game_player_id,
      SUM((elem->>'points')::numeric) as total_points,
      MIN((elem->>'hcp_juego')::integer) as hcp_juego,
      SUM(
        COALESCE(
          (SELECT SUM((score->>'gross_strokes')::integer)
           FROM jsonb_array_elements(ar.hole_scores) AS score
           WHERE (linked.id IS NOT NULL AND score->>'player_id'=elem->>'player_id') OR (linked.id IS NULL AND score->>'player_name'=elem->>'player_name')
          ), 0)
      ) as total_strokes,
      SUM((elem->>'points')::numeric) as total_stableford_net
    FROM public.group_statistics_rounds ar
    CROSS JOIN jsonb_array_elements(ar.final_ranking) AS elem
    LEFT JOIN players linked ON linked.id::text=elem->>'player_db_id' AND linked.group_id=ar.group_id
    WHERE ar.group_id = p_group_id
      AND DATE(ar.played_at) = p_date
      AND ar.ranking_session = p_session
    GROUP BY linked.id, CASE WHEN linked.id IS NULL THEN (elem->>'player_name')::text ELSE NULL END
  ),
  ranked_players AS (
    SELECT
      group_id,
      ranking_date,
      player_name,
      game_player_id,
      total_points,
      hcp_juego,
      total_strokes,
      total_stableford_net,
      ROW_NUMBER() OVER (
        ORDER BY
          total_points DESC,
          hcp_juego ASC,
          player_name ASC
      ) as position
    FROM player_totals
  ),
  player_count AS (
    SELECT COUNT(*) as total FROM ranked_players
  )
  INSERT INTO daily_rankings (
    group_id,
    ranking_date,
    ranking_session,
    player_name,
    game_player_id,
    total_points,
    hcp_juego,
    position,
    receives_beer,
    pays_beer,
    total_strokes,
    total_stableford_net,
    handicap_play
  )
  SELECT
    rp.group_id,
    rp.ranking_date,
    p_session,
    rp.player_name,
    rp.game_player_id,
    rp.total_points,
    rp.hcp_juego,
    rp.position,
    rp.position <= FLOOR(pc.total / 2.0) as receives_beer,
    CASE
      WHEN pc.total % 2 = 0 THEN rp.position > (pc.total / 2)
      ELSE rp.position > FLOOR(pc.total / 2.0) + 1
    END as pays_beer,
    rp.total_strokes,
    rp.total_stableford_net,
    rp.hcp_juego::numeric
  FROM ranked_players rp
  CROSS JOIN player_count pc;
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_daily_ranking_session(uuid,date,smallint) FROM PUBLIC,anon,authenticated;

-- Misma firma de siempre (la usa el trigger al archivar y al borrar): recalcula
-- todas las jornadas del día y elimina las que se hayan quedado sin partidas.
CREATE OR REPLACE FUNCTION calculate_daily_ranking(p_group_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_session smallint;
BEGIN
  DELETE FROM daily_rankings
  WHERE group_id = p_group_id
    AND ranking_date = p_date;

  FOR v_session IN
    SELECT DISTINCT ar.ranking_session FROM public.archived_rounds ar
    WHERE ar.group_id = p_group_id AND DATE(ar.played_at) = p_date
    ORDER BY 1
  LOOP
    PERFORM public.calculate_daily_ranking_session(p_group_id, p_date, v_session);
  END LOOP;
END;
$$;

-- Los títulos del Pro-Shop de la clasificación diaria también se cuentan por jornada.
CREATE OR REPLACE FUNCTION public.sync_daily_gamification_counts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ranking public.daily_rankings; event_id text; total integer; counts jsonb;
BEGIN
  FOR ranking IN SELECT * FROM public.daily_rankings WHERE group_id=NEW.group_id AND ranking_date=NEW.played_at::date LOOP
    counts:='{}'::jsonb;
    FOREACH event_id IN ARRAY ARRAY['buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos'] LOOP
      SELECT coalesce(sum(coalesce((stat->'gamification_counts'->>event_id)::integer,0)),0) INTO total
      FROM public.archived_rounds ar CROSS JOIN LATERAL jsonb_array_elements(coalesce(ar.player_stats,'[]'::jsonb)) stat
      WHERE ar.group_id=NEW.group_id AND ar.played_at::date=NEW.played_at::date
        AND ar.ranking_session=ranking.ranking_session AND stat->>'player_name'=ranking.player_name;
      IF total>0 THEN counts:=counts||jsonb_build_object(event_id,total); END IF;
    END LOOP;
    UPDATE public.daily_rankings SET gamification_counts=counts WHERE id=ranking.id;
  END LOOP;
  RETURN NEW;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
