BEGIN;

ALTER TABLE public.user_subscriptions
  ADD COLUMN team_trial_started_at timestamptz,
  ADD COLUMN team_trial_ends_at timestamptz,
  ADD CONSTRAINT user_subscriptions_team_trial_dates_check CHECK (
    (team_trial_started_at IS NULL AND team_trial_ends_at IS NULL)
    OR (team_trial_started_at IS NOT NULL AND team_trial_ends_at > team_trial_started_at)
  );

CREATE FUNCTION public.start_team_trial()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  subscription public.user_subscriptions;
  trial_end timestamptz := now() + interval '30 days';
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para activar la prueba Team';
  END IF;

  IF EXISTS (SELECT 1 FROM public.app_administrators WHERE user_id = caller)
     OR EXISTS (SELECT 1 FROM public.app_user_restrictions WHERE user_id = caller AND read_only) THEN
    RAISE EXCEPTION 'Esta cuenta no puede activar la prueba Team';
  END IF;

  SELECT * INTO subscription
  FROM public.user_subscriptions
  WHERE user_id = caller
  FOR UPDATE;

  IF subscription.user_id IS NULL
     OR subscription.status <> 'active'
     OR subscription.plan_type <> 'player'
     OR (subscription.current_period_end IS NOT NULL AND subscription.current_period_end <= now()) THEN
    RAISE EXCEPTION 'La prueba Team solo está disponible para cuentas Player activas';
  END IF;

  IF subscription.team_trial_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta cuenta ya ha utilizado la prueba Team';
  END IF;

  UPDATE public.user_subscriptions
  SET team_trial_started_at = now(),
      team_trial_ends_at = trial_end,
      updated_at = now()
  WHERE user_id = caller;

  RETURN trial_end;
END;
$$;

REVOKE ALL ON FUNCTION public.start_team_trial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_team_trial() TO authenticated;

COMMIT;
