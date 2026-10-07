-- Read-only, code-based statistics access for completed Express rounds.
CREATE OR REPLACE FUNCTION public.get_express_round_statistics_by_code(p_access_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.golf_rounds;
  result jsonb;
BEGIN
  IF nullif(trim(p_access_code), '') IS NULL OR length(trim(p_access_code)) > 32 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO r
  FROM public.golf_rounds
  WHERE upper(access_code) = upper(trim(p_access_code))
    AND group_id IS NULL
    AND status IN ('completed', 'archived')
    AND admin_withdrawn_at IS NULL
  LIMIT 1;

  IF r.id IS NULL THEN RETURN NULL; END IF;

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

REVOKE ALL ON FUNCTION public.get_express_round_statistics_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_express_round_statistics_by_code(text) TO anon, authenticated;
