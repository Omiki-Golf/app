-- When an Express player registers or signs in, the quick rounds that device
-- created (owned by its anonymous "anon_<uuid>" identifier) move to the account.
-- Rounds played on other people's devices are not touched.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_device_rounds(p_device_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  moved integer := 0;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para recuperar tus partidas' USING ERRCODE = '42501';
  END IF;

  IF p_device_id IS NULL
     OR p_device_id !~ '^anon_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Identificador de dispositivo no válido';
  END IF;

  IF EXISTS (SELECT 1 FROM public.app_administrators WHERE user_id = caller)
     OR EXISTS (SELECT 1 FROM public.app_user_restrictions WHERE user_id = caller AND read_only) THEN
    RETURN 0;
  END IF;

  UPDATE public.golf_rounds
  SET user_id = caller::text, updated_at = now()
  WHERE user_id = p_device_id
    AND group_id IS NULL;
  GET DIAGNOSTICS moved = ROW_COUNT;

  IF to_regclass('public.completed_rounds_summary') IS NOT NULL THEN
    EXECUTE 'UPDATE public.completed_rounds_summary SET user_id = $1 WHERE user_id = $2'
      USING caller::text, p_device_id;
  END IF;

  RETURN moved;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_device_rounds(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_device_rounds(text) TO authenticated;

COMMIT;
