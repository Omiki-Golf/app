-- Copa Match Play: invitados sin cuenta y resultados de tarjeta en papel.
-- - El cuadro no puede tener más invitados sin cuenta que jugadores registrados, ni un cruce
--   de primera ronda entre dos invitados (nadie podría llevar la tarjeta en la app).
--   Se comprueba al guardar el sorteo y al publicarlo, también con sorteos ya preparados.
-- - Si dos invitados se cruzan en rondas posteriores juegan en papel: el creador o un
--   administrador anota cada partido con record_cup_paper_game (origen 'paper').
BEGIN;

-- ---------------------------------------------------------------------------
-- Reparto de invitados en el cuadro
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cup_require_guest_pairing(p_slots uuid[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_guests integer; v_registered integer; i integer;
BEGIN
  SELECT count(*) FILTER (WHERE x.user_id IS NULL), count(*) FILTER (WHERE x.user_id IS NOT NULL)
  INTO v_guests, v_registered
  FROM unnest(p_slots) s JOIN public.cup_entrants x ON x.id = s;
  IF v_guests > v_registered THEN
    RAISE EXCEPTION 'La Copa no puede tener más invitados sin cuenta (%) que jugadores registrados (%)', v_guests, v_registered
      USING ERRCODE='23514', HINT='cup_guest_limit';
  END IF;
  FOR i IN 0 .. coalesce(cardinality(p_slots), 0) / 2 - 1 LOOP
    IF p_slots[2 * i + 1] IS NOT NULL AND p_slots[2 * i + 2] IS NOT NULL
       AND (SELECT count(*) FROM public.cup_entrants x
            WHERE x.id IN (p_slots[2 * i + 1], p_slots[2 * i + 2]) AND x.user_id IS NULL) = 2 THEN
      RAISE EXCEPTION 'El cruce % enfrenta a dos invitados sin cuenta: cada cruce necesita al menos un jugador registrado', i + 1
        USING ERRCODE='23514', HINT='cup_guest_pair';
    END IF;
  END LOOP;
END $$;

-- Se aplica a cualquier sorteo que se guarde y a cualquier cuadro que se publique.
CREATE FUNCTION public.guard_cup_draw_guests() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.draw_slots IS NOT NULL AND (
       NEW.draw_slots IS DISTINCT FROM OLD.draw_slots
       OR (OLD.status = 'draw_ready' AND NEW.status = 'active')) THEN
    PERFORM public.cup_require_guest_pairing(NEW.draw_slots);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER a_cup_draw_guests BEFORE UPDATE OF draw_slots, status ON public.cup_editions
FOR EACH ROW EXECUTE FUNCTION public.guard_cup_draw_guests();

-- ---------------------------------------------------------------------------
-- Partidos anotados desde una tarjeta en papel
-- ---------------------------------------------------------------------------
ALTER TABLE public.cup_games DROP CONSTRAINT cup_games_source_check;
ALTER TABLE public.cup_games ADD CONSTRAINT cup_games_source_check CHECK (source IN ('played','corrected','paper'));

CREATE FUNCTION public.record_cup_paper_game(p_match uuid, p_winner uuid, p_score text, p_decisive_hole integer DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.cup_matches; e public.cup_editions; v_game integer;
BEGIN
  SELECT * INTO m FROM public.cup_matches WHERE id = p_match FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Eliminatoria no encontrada'; END IF;
  e := public.cup_manage_edition(m.edition_id, ARRAY['active']);
  IF m.entrant_a IS NULL OR m.entrant_b IS NULL OR m.winner_entrant IS NOT NULL THEN
    RAISE EXCEPTION 'Esta eliminatoria no está pendiente de jugar' USING ERRCODE='55000';
  END IF;
  IF p_winner IS NULL OR p_winner NOT IN (m.entrant_a, m.entrant_b) THEN RAISE EXCEPTION 'El ganador debe ser uno de los dos jugadores'; END IF;
  IF nullif(trim(coalesce(p_score, '')), '') IS NULL OR length(trim(p_score)) > 40 THEN RAISE EXCEPTION 'Indica el marcador'; END IF;
  IF p_decisive_hole IS NOT NULL AND (p_decisive_hole < 19 OR p_decisive_hole > 40) THEN RAISE EXCEPTION 'Hoyo de desempate no válido'; END IF;
  IF EXISTS (SELECT 1 FROM public.golf_rounds r WHERE r.cup_match_id = m.id AND r.status IN ('active','completed')
             AND NOT EXISTS (SELECT 1 FROM public.cup_games g WHERE g.round_id = r.id)) THEN
    RAISE EXCEPTION 'Hay una partida de esta eliminatoria en juego o pendiente de registrar' USING ERRCODE='55000';
  END IF;
  SELECT coalesce(max(game_number), 0) + 1 INTO v_game FROM public.cup_games WHERE match_id = m.id;
  IF v_game > m.best_of THEN RAISE EXCEPTION 'La serie ya tiene todos sus partidos' USING ERRCODE='55000'; END IF;
  INSERT INTO public.cup_games(match_id, game_number, winner_entrant, score, decisive_hole, round_id, source, recorded_by)
  VALUES (m.id, v_game, p_winner, trim(p_score), p_decisive_hole, NULL, 'paper', auth.uid());
  PERFORM public.cup_require_consistent_series(m.id);
  PERFORM public.cup_log(e.id, m.id, 'cup.game.paper', jsonb_build_object('game', v_game, 'winner', p_winner,
    'score', trim(p_score), 'decisive_hole', p_decisive_hole));
  PERFORM public.cup_refresh(e.id);
END $$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cup_require_guest_pairing(uuid[]), public.guard_cup_draw_guests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_cup_paper_game(uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cup_paper_game(uuid, uuid, text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
