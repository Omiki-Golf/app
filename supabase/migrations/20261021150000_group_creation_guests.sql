BEGIN;

CREATE OR REPLACE FUNCTION public.add_group_guest_player(
  p_group uuid,
  p_name text,
  p_handicap_18 numeric
) RETURNS public.players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_player public.players;
  v_handicap_9 numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(20261021, 1500);
  PERFORM public.require_group_manager(p_group);

  IF nullif(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Indica el nombre del jugador';
  END IF;
  IF p_handicap_18 IS NULL OR p_handicap_18 < 0 OR p_handicap_18 > 54
     OR p_handicap_18::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Indica un hándicap de 18 hoyos entre 0 y 54';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.players
    WHERE group_id = p_group AND lower(name) = lower(trim(p_name))
  ) THEN
    RAISE EXCEPTION 'Ya existe un jugador con ese nombre en el grupo';
  END IF;
  IF (SELECT count(*) FROM public.players WHERE group_id = p_group) >= 20 THEN
    RAISE EXCEPTION 'El grupo ya ha alcanzado el máximo de jugadores';
  END IF;

  v_handicap_9 := round(p_handicap_18 / 2);
  INSERT INTO public.players (
    group_id, name, exact_handicap, exact_handicap_18, playing_handicap, is_guest
  ) VALUES (
    p_group, trim(p_name), v_handicap_9, v_handicap_9, v_handicap_9, true
  ) RETURNING * INTO v_player;

  RETURN v_player;
END;
$$;

REVOKE ALL ON FUNCTION public.add_group_guest_player(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_group_guest_player(uuid, text, numeric) TO authenticated;

COMMIT;
