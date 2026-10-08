BEGIN;

-- Completing any round is reserved to the identity stored as its creator.
-- Keep the historical function name because the existing trigger references it.
CREATE OR REPLACE FUNCTION public.guard_express_round_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor text := coalesce(
    auth.uid()::text,
    nullif(current_setting('app.round_finish_actor', true), '')
  );
BEGIN
  IF OLD.status = 'active'
     AND NEW.status = 'completed'
     AND actor IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Solo el creador puede finalizar la partida' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_round(p_round uuid, p_actor text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.golf_rounds;
  actor text := coalesce(auth.uid()::text, nullif(trim(p_actor), ''));
BEGIN
  SELECT * INTO r
  FROM public.golf_rounds
  WHERE id = p_round
  FOR UPDATE;

  IF r.id IS NULL OR r.status <> 'active' THEN
    RAISE EXCEPTION 'La partida no está activa';
  END IF;
  IF actor IS DISTINCT FROM r.user_id THEN
    RAISE EXCEPTION 'Solo el creador puede finalizar la partida' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.round_finish_actor', actor, true);
  UPDATE public.golf_rounds
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = r.id;
END;
$$;

-- Backwards-compatible entry point, now with creator-only semantics.
CREATE OR REPLACE FUNCTION public.finish_express_round(p_round uuid, p_actor text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.golf_rounds
    WHERE id = p_round AND group_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La partida Express no está activa';
  END IF;
  PERFORM public.finish_round(p_round, p_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_express_round_completion(),
  public.finish_round(uuid, text),
  public.finish_express_round(uuid, text),
  public.set_express_round_responsible(uuid, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finish_round(uuid, text),
  public.finish_express_round(uuid, text)
TO anon, authenticated;

COMMIT;
