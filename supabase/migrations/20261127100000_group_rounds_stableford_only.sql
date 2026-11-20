-- Las partidas de grupo se juegan siempre a Stableford: clasificación, cervezas y variación de
-- hándicap se calculan con sus puntos. Las partidas rápidas (sin grupo) admiten todas las modalidades.
-- Solo afecta a partidas nuevas o a cambios de grupo/modalidad; las existentes no se tocan.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_group_round_stableford()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.group_id IS NOT NULL AND coalesce(NEW.game_mode, 'stableford') <> 'stableford'
     AND (TG_OP = 'INSERT' OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.game_mode IS DISTINCT FROM OLD.game_mode) THEN
    RAISE EXCEPTION 'Las partidas de grupo se juegan siempre a Stableford' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_group_round_stableford() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_group_round_stableford ON public.golf_rounds;
CREATE TRIGGER guard_group_round_stableford BEFORE INSERT OR UPDATE OF group_id, game_mode ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_group_round_stableford();

COMMIT;
