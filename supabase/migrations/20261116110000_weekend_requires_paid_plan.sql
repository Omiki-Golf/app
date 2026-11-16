-- Omiki Weekend es un extra: solo se activa sobre un plan de pago vigente (Player, Team o Premium).
-- Misma regla que effectivePlan en la app. Ya no se crean cuentas Express con Weekend.
BEGIN;

CREATE OR REPLACE FUNCTION public.activate_weekend_for_testing(p_days integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_until timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar Weekend' USING ERRCODE='42501';
  END IF;
  IF p_days NOT IN (7,90) THEN RAISE EXCEPTION 'Duración Weekend no válida'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_subscriptions s
    WHERE s.user_id=auth.uid() AND s.status='active'
      AND s.plan_type IN ('player','team','premium')
      AND (s.current_period_end IS NULL OR s.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Para activar Omiki Weekend necesitas estar suscrito a un plan Omiki: Player o Team.' USING ERRCODE='42501';
  END IF;
  v_until := clock_timestamp() + make_interval(days => p_days);
  UPDATE public.user_subscriptions SET weekend_mode_until=v_until,updated_at=clock_timestamp() WHERE user_id=auth.uid();
  RETURN v_until;
END $$;

REVOKE ALL ON FUNCTION public.activate_weekend_for_testing(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_weekend_for_testing(integer) TO authenticated;

COMMIT;
