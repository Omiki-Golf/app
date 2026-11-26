-- Puntos configurables por partida en Sindicato y Parejas.
-- golf_rounds.mode_points_config guarda el reparto elegido al crear la partida:
--   Sindicato: {"sindicato":[6,4,2]}   (1º, 2º, 3º; los empatados se reparten
--              a partes iguales los puntos de los puestos que ocupan)
--   Parejas:   {"parejas":{"best":1,"worst":1}}
-- NULL conserva el reglamento anterior (4-2-0 y 1/0,5), así las partidas ya
-- creadas se siguen recalculando igual. La decisión anticipada usa como
-- máximo por hoyo pendiente 1º-3º en Sindicato y mejor+peor en Parejas.

ALTER TABLE public.golf_rounds
  ADD COLUMN IF NOT EXISTS mode_points_config jsonb;

CREATE OR REPLACE FUNCTION public.valid_mode_points_config(config jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v jsonb;
  p1 numeric; p2 numeric; p3 numeric; best numeric; worst numeric;
BEGIN
  IF config IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(config) <> 'object' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(config) k WHERE k NOT IN ('sindicato', 'parejas')) THEN
    RETURN false;
  END IF;

  IF config ? 'sindicato' THEN
    v := config -> 'sindicato';
    IF jsonb_typeof(v) IS DISTINCT FROM 'array' OR jsonb_array_length(v) <> 3 THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e) <> 'number') THEN RETURN false; END IF;
    p1 := (v ->> 0)::numeric; p2 := (v ->> 1)::numeric; p3 := (v ->> 2)::numeric;
    IF p3 < 0 OR p1 > 99 OR p1 < p2 OR p2 < p3 OR p1 = p3 THEN RETURN false; END IF;
    IF (p1 * 2) % 1 <> 0 OR (p2 * 2) % 1 <> 0 OR (p3 * 2) % 1 <> 0 THEN RETURN false; END IF;
  END IF;

  IF config ? 'parejas' THEN
    v := config -> 'parejas';
    IF jsonb_typeof(v) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v -> 'best') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v -> 'worst') IS DISTINCT FROM 'number' THEN
      RETURN false;
    END IF;
    best := (v ->> 'best')::numeric; worst := (v ->> 'worst')::numeric;
    IF best < 0 OR worst < 0 OR best > 99 OR worst > 99 OR best + worst = 0 THEN RETURN false; END IF;
    IF (best * 2) % 1 <> 0 OR (worst * 2) % 1 <> 0 THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$;

ALTER TABLE public.golf_rounds
  DROP CONSTRAINT IF EXISTS golf_rounds_mode_points_config_valid;
ALTER TABLE public.golf_rounds
  ADD CONSTRAINT golf_rounds_mode_points_config_valid
  CHECK (public.valid_mode_points_config(mode_points_config));

CREATE OR REPLACE FUNCTION public.record_round_decision(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.golf_rounds;
  player_count integer;
  played_holes integer;
  remaining integer;
  leaders record;
  winner_ids jsonb;
  winner_names jsonb;
  winner_label text;
  margin numeric;
  margin_display text;
  result jsonb;
  per_hole numeric;
BEGIN
  SELECT * INTO r FROM public.golf_rounds WHERE id = p_round FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'active' OR r.game_mode NOT IN ('match', 'parejas', 'sindicato') THEN
    RETURN r.decided_result;
  END IF;
  IF r.decided_result IS NOT NULL THEN
    RETURN r.decided_result;
  END IF;

  SELECT count(*)::integer INTO player_count
  FROM public.round_players WHERE round_id = r.id;

  IF (r.game_mode = 'match' AND player_count <> 2)
     OR (r.game_mode = 'parejas' AND player_count <> 4)
     OR (r.game_mode = 'sindicato' AND player_count <> 3) THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::integer INTO played_holes
  FROM (
    SELECT rs.hole_number
    FROM public.round_scores rs
    WHERE rs.round_id = r.id
      AND (rs.abandoned = true OR rs.gross_strokes > 0)
    GROUP BY rs.hole_number
    HAVING count(*) = player_count
  ) complete_holes;
  remaining := r.num_holes - played_holes;
  IF remaining < 0 THEN RETURN NULL; END IF;

  IF r.game_mode = 'match' THEN
    SELECT rp.id, rp.name, coalesce(sum(rs.mode_points), 0) AS points
    INTO leaders
    FROM public.round_players rp
    LEFT JOIN public.round_scores rs ON rs.player_id = rp.id
    WHERE rp.round_id = r.id
    GROUP BY rp.id, rp.name, rp.playing_handicap, rp.created_at
    ORDER BY points DESC, rp.playing_handicap ASC, rp.created_at ASC
    LIMIT 1;

    SELECT abs(max(total_points) - min(total_points)) INTO margin
    FROM (
      SELECT coalesce(sum(rs.mode_points), 0) AS total_points
      FROM public.round_players rp
      LEFT JOIN public.round_scores rs ON rs.player_id = rp.id
      WHERE rp.round_id = r.id GROUP BY rp.id
    ) totals;
    IF margin <= remaining THEN RETURN NULL; END IF;
    winner_ids := jsonb_build_array(leaders.id);
    winner_names := jsonb_build_array(leaders.name);
    winner_label := leaders.name;

  ELSIF r.game_mode = 'parejas' THEN
    WITH ordered AS (
      SELECT rp.id, rp.name, row_number() OVER (ORDER BY rp.created_at, rp.id) AS position
      FROM public.round_players rp WHERE rp.round_id = r.id
    ), team_totals AS (
      SELECT CASE WHEN o.position <= 2 THEN 0 ELSE 1 END AS team,
             max(CASE WHEN o.position IN (1, 3) THEN coalesce(t.points, 0) END) AS points
      FROM ordered o
      LEFT JOIN (
        SELECT player_id, sum(mode_points) AS points
        FROM public.round_scores WHERE round_id = r.id GROUP BY player_id
      ) t ON t.player_id = o.id
      GROUP BY CASE WHEN o.position <= 2 THEN 0 ELSE 1 END
    )
    SELECT abs(max(points) - min(points)) INTO margin FROM team_totals;
    per_hole := CASE WHEN r.mode_points_config ? 'parejas'
      THEN (r.mode_points_config #>> '{parejas,best}')::numeric + (r.mode_points_config #>> '{parejas,worst}')::numeric
      ELSE 1.5 END;
    IF margin <= remaining * per_hole THEN RETURN NULL; END IF;

    WITH ordered AS (
      SELECT rp.id, rp.name, row_number() OVER (ORDER BY rp.created_at, rp.id) AS position
      FROM public.round_players rp WHERE rp.round_id = r.id
    ), totals AS (
      SELECT o.*, coalesce(sum(rs.mode_points), 0) AS points
      FROM ordered o LEFT JOIN public.round_scores rs ON rs.player_id = o.id
      GROUP BY o.id, o.name, o.position
    ), winning_team AS (
      SELECT CASE WHEN position <= 2 THEN 0 ELSE 1 END AS team
      FROM totals WHERE position IN (1, 3) ORDER BY points DESC LIMIT 1
    )
    SELECT jsonb_agg(id ORDER BY position), jsonb_agg(name ORDER BY position),
           string_agg(name, ' / ' ORDER BY position)
    INTO winner_ids, winner_names, winner_label
    FROM totals
    WHERE CASE WHEN position <= 2 THEN 0 ELSE 1 END = (SELECT team FROM winning_team);

  ELSE
    SELECT rp.id, rp.name, coalesce(sum(rs.mode_points), 0) AS points
    INTO leaders
    FROM public.round_players rp
    LEFT JOIN public.round_scores rs ON rs.player_id = rp.id
    WHERE rp.round_id = r.id
    GROUP BY rp.id, rp.name, rp.playing_handicap, rp.created_at
    ORDER BY points DESC, rp.playing_handicap ASC, rp.created_at ASC
    LIMIT 1;

    SELECT max(total_points) - (
      SELECT total_points FROM (
        SELECT coalesce(sum(rs.mode_points), 0) AS total_points, rp.playing_handicap, rp.created_at
        FROM public.round_players rp LEFT JOIN public.round_scores rs ON rs.player_id = rp.id
        WHERE rp.round_id = r.id
        GROUP BY rp.id, rp.playing_handicap, rp.created_at
        ORDER BY total_points DESC, rp.playing_handicap ASC, rp.created_at ASC OFFSET 1 LIMIT 1
      ) runner_up
    ) INTO margin
    FROM (
      SELECT coalesce(sum(rs.mode_points), 0) AS total_points
      FROM public.round_players rp LEFT JOIN public.round_scores rs ON rs.player_id = rp.id
      WHERE rp.round_id = r.id GROUP BY rp.id
    ) totals;
    per_hole := CASE WHEN r.mode_points_config ? 'sindicato'
      THEN (r.mode_points_config #>> '{sindicato,0}')::numeric - (r.mode_points_config #>> '{sindicato,2}')::numeric
      ELSE 4 END;
    IF margin <= remaining * per_hole THEN RETURN NULL; END IF;
    winner_ids := jsonb_build_array(leaders.id);
    winner_names := jsonb_build_array(leaders.name);
    winner_label := leaders.name;
  END IF;

  margin_display := trim_scale(margin)::text;
  result := jsonb_build_object(
    'mode', r.game_mode,
    'winner_player_ids', winner_ids,
    'winner_names', winner_names,
    'winner_label', winner_label,
    'margin', margin,
    'holes_remaining', remaining,
    'display_text', CASE
      WHEN r.game_mode IN ('match', 'parejas') THEN margin_display || '&' || remaining
      ELSE margin_display || ' puntos de ventaja · ' || remaining || ' por jugar'
    END
  );

  UPDATE public.golf_rounds
  SET decided_result = result, decided_at = now(), updated_at = now()
  WHERE id = r.id AND decided_result IS NULL;

  RETURN (SELECT decided_result FROM public.golf_rounds WHERE id = r.id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_round_decision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_round_decision(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.valid_mode_points_config(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_mode_points_config(jsonb) TO anon, authenticated;
