-- Registro de errores de la app (la ventana «Algo salió mal»).
-- - La app guarda el mensaje, la pila, la pantalla y la versión cuando una pantalla falla al dibujarse.
-- - Se puede registrar con o sin sesión; con sesión se guarda la cuenta (auth.uid()).
-- - Sin acceso directo a la tabla: solo la función de alta, con textos recortados y límite de ritmo.
-- - Se conservan 90 días. Se consultan desde SQL (administradores).
BEGIN;

CREATE TABLE IF NOT EXISTS public.client_errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  kind text NOT NULL CHECK (kind IN ('render','chunk')),
  message text NOT NULL,
  stack text,
  component_stack text,
  view text,
  app_version text,
  url text,
  user_agent text,
  online boolean
);
CREATE INDEX IF NOT EXISTS client_errors_recent ON public.client_errors (created_at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_client_error(
  p_kind text, p_message text, p_stack text DEFAULT NULL, p_component_stack text DEFAULT NULL,
  p_view text DEFAULT NULL, p_app_version text DEFAULT NULL, p_url text DEFAULT NULL,
  p_user_agent text DEFAULT NULL, p_online boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('render','chunk') OR coalesce(btrim(p_message), '') = '' THEN
    RETURN;
  END IF;
  -- Límite de ritmo: 20 por cuenta y hora; sin sesión, 500 por hora en total.
  IF v_user IS NOT NULL THEN
    IF (SELECT count(*) FROM public.client_errors WHERE user_id = v_user AND created_at > now() - interval '1 hour') >= 20 THEN RETURN; END IF;
  ELSIF (SELECT count(*) FROM public.client_errors WHERE user_id IS NULL AND created_at > now() - interval '1 hour') >= 500 THEN
    RETURN;
  END IF;

  INSERT INTO public.client_errors (user_id, kind, message, stack, component_stack, view, app_version, url, user_agent, online)
  VALUES (v_user, p_kind, left(p_message, 1000), left(p_stack, 4000), left(p_component_stack, 4000),
          left(p_view, 80), left(p_app_version, 40), left(split_part(p_url, '?', 1), 300), left(p_user_agent, 300), p_online);

  DELETE FROM public.client_errors WHERE created_at < now() - interval '90 days';
END $$;

REVOKE ALL ON FUNCTION public.log_client_error(text, text, text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text, text, text, boolean) TO anon, authenticated;

COMMIT;
