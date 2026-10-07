BEGIN;

CREATE OR REPLACE FUNCTION public.use_authenticated_round_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid()::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS use_authenticated_round_owner_on_insert ON public.golf_rounds;
CREATE TRIGGER use_authenticated_round_owner_on_insert
BEFORE INSERT ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.use_authenticated_round_owner();

DO $$
BEGIN
  IF to_regclass('public.completed_rounds_summary') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS use_authenticated_summary_owner_on_insert ON public.completed_rounds_summary';
    EXECUTE 'CREATE TRIGGER use_authenticated_summary_owner_on_insert
      BEFORE INSERT ON public.completed_rounds_summary
      FOR EACH ROW EXECUTE FUNCTION public.use_authenticated_round_owner()';
  END IF;
END;
$$;

COMMIT;
