BEGIN;

-- Cuando una partida de Match, Parejas o Sindicato queda decidida (shakehands):
--  * los hoyos ya completos en ese momento se cierran y no se pueden modificar;
--  * el creador puede finalizarla sin jugar los hoyos que faltan.
-- El resultado oficial (decided_result) ya era inmutable desde 20261008100000.

ALTER TABLE public.golf_rounds
  ADD COLUMN IF NOT EXISTS decided_holes integer[];

-- Hoyos en los que todos los jugadores de la partida tienen resultado (golpes o raya).
CREATE OR REPLACE FUNCTION public.round_complete_holes(p_round uuid)
RETURNS integer[]
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(hole_number ORDER BY hole_number), '{}'::integer[])
  FROM (
    SELECT rs.hole_number
    FROM public.round_scores rs
    WHERE rs.round_id = p_round
      AND (rs.abandoned = true OR rs.gross_strokes > 0)
    GROUP BY rs.hole_number
    HAVING count(DISTINCT rs.player_id) = (SELECT count(*) FROM public.round_players rp WHERE rp.round_id = p_round)
  ) complete_holes;
$$;

-- Al guardarse el resultado decidido, se apuntan los hoyos que quedan cerrados.
CREATE OR REPLACE FUNCTION public.capture_decided_holes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.decided_result IS NULL AND NEW.decided_result IS NOT NULL AND NEW.decided_holes IS NULL THEN
    NEW.decided_holes := public.round_complete_holes(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_decided_holes ON public.golf_rounds;
CREATE TRIGGER capture_decided_holes
BEFORE UPDATE OF decided_result ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.capture_decided_holes();

-- Una vez fijados, los hoyos cerrados no cambian.
CREATE OR REPLACE FUNCTION public.guard_decided_holes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.decided_holes IS NOT NULL AND NEW.decided_holes IS DISTINCT FROM OLD.decided_holes THEN
    RAISE EXCEPTION 'Los hoyos de la partida decidida ya están cerrados' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_decided_holes ON public.golf_rounds;
CREATE TRIGGER guard_decided_holes
BEFORE UPDATE OF decided_holes ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_decided_holes();

-- Partidas activas ya decididas antes de esta migración: se cierran sus hoyos completos actuales.
UPDATE public.golf_rounds r
SET decided_holes = public.round_complete_holes(r.id)
WHERE r.status = 'active' AND r.decided_result IS NOT NULL AND r.decided_holes IS NULL;

-- Ningún golpe de un hoyo cerrado se puede crear, cambiar ni borrar mientras la partida está activa.
CREATE OR REPLACE FUNCTION public.guard_decided_round_scores()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_round uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.round_id ELSE NEW.round_id END;
  locked integer[];
BEGIN
  IF current_setting('app.account_deletion', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT r.decided_holes INTO locked
  FROM public.golf_rounds r
  WHERE r.id = target_round AND r.status = 'active';

  IF locked IS NOT NULL AND (
    (TG_OP <> 'INSERT' AND OLD.hole_number = ANY(locked))
    OR (TG_OP <> 'DELETE' AND NEW.hole_number = ANY(locked))
  ) THEN
    RAISE EXCEPTION 'La partida ya está decidida: este hoyo no se puede modificar' USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS guard_decided_round_scores ON public.round_scores;
CREATE TRIGGER guard_decided_round_scores
BEFORE INSERT OR UPDATE OR DELETE ON public.round_scores
FOR EACH ROW EXECUTE FUNCTION public.guard_decided_round_scores();

-- Una partida decidida se puede finalizar aunque falten hoyos; las demás siguen necesitando todos los golpes.
CREATE OR REPLACE FUNCTION public.guard_round_completion_and_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.decided_result IS NOT NULL
     AND (NEW.decided_result IS DISTINCT FROM OLD.decided_result
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at) THEN
    RAISE EXCEPTION 'El resultado oficial de la partida ya está decidido';
  END IF;

  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed'
     AND OLD.decided_result IS NULL
     AND NOT public.round_scores_complete(OLD.id) THEN
    RAISE EXCEPTION 'No se puede finalizar: faltan golpes por informar';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.round_complete_holes(uuid), public.capture_decided_holes(),
  public.guard_decided_holes(), public.guard_decided_round_scores() FROM PUBLIC, anon, authenticated;

COMMIT;
