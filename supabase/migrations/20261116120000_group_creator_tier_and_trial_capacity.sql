-- El aspecto del grupo queda fijado por el tier efectivo de su creador al crearlo.
-- Una prueba Team permite el primer grupo, pero no comprar/usar capacidad adicional.
BEGIN;

-- Recupera los grupos Premium existentes que hasta ahora se pintaban según el plan
-- actual del propietario. Los grupos Team y de prueba conservan el valor false.
UPDATE public.groups g
SET premium_branding=true
FROM public.user_subscriptions subscription
WHERE subscription.user_id=g.user_auth_id
  AND subscription.plan_type='premium'
  AND subscription.status='active'
  AND (subscription.current_period_end IS NULL OR subscription.current_period_end>clock_timestamp())
  AND g.group_type IS DISTINCT FROM 'weekend';

CREATE OR REPLACE FUNCTION public.guard_one_active_owned_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_capacity integer := 1;
  v_weekend_until timestamptz;
  v_plan text;
  v_status text;
  v_period_end timestamptz;
  v_trial_end timestamptz;
  v_paid_team boolean := false;
  v_effective_team boolean := false;
BEGIN
  IF NEW.user_auth_id IS NULL OR NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT plan_type,status,current_period_end,team_trial_ends_at,weekend_mode_until
  INTO v_plan,v_status,v_period_end,v_trial_end,v_weekend_until
  FROM public.user_subscriptions WHERE user_id=NEW.user_auth_id;

  IF NEW.group_type='weekend' THEN
    IF TG_OP='INSERT' OR OLD.group_type IS DISTINCT FROM 'weekend' THEN
      IF v_weekend_until IS NULL OR v_weekend_until<=clock_timestamp() THEN
        RAISE EXCEPTION 'Necesitas un Weekend activo para crear este grupo.';
      END IF;
      NEW.weekend_mode_until:=v_weekend_until;
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.groups g
      WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id
        AND g.group_type='weekend' AND g.weekend_mode_until>clock_timestamp()
    ) THEN RAISE EXCEPTION 'Ya tienes un grupo Weekend activo.'; END IF;
    RETURN NEW;
  END IF;

  v_paid_team := v_status='active'
    AND v_plan IN ('team','premium')
    AND (v_period_end IS NULL OR v_period_end>clock_timestamp());
  v_effective_team := v_paid_team OR (
    v_status='active' AND v_plan='player' AND v_trial_end>clock_timestamp()
  );
  IF NOT v_effective_team THEN
    RAISE EXCEPTION 'Necesitas un plan Team o Premium para crear un grupo.' USING ERRCODE='42501';
  END IF;

  -- Snapshot del tier del creador: todos los miembros verán siempre el mismo grupo.
  IF TG_OP='INSERT' THEN NEW.premium_branding := v_paid_team AND v_plan='premium'; END IF;

  -- Solo un Team/Premium pagado puede ampliar la capacidad con Grupo Adicional.
  IF v_paid_team THEN
    SELECT 1 + count(*) INTO v_capacity
    FROM public.pro_shop_purchases purchase
    JOIN public.groups owned ON owned.id=purchase.group_id
    WHERE owned.user_auth_id=NEW.user_auth_id
      AND purchase.product_type='grupo-adicional' AND purchase.status='completed';
  END IF;
  IF (
    SELECT count(*) FROM public.groups g
    WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id
      AND g.group_type IS DISTINCT FROM 'weekend'
  )>=v_capacity THEN
    RAISE EXCEPTION 'Tu plan no dispone de más grupos activos.' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;

-- La RPC de prueba tampoco permite conceder Grupo Adicional durante un trial.
CREATE OR REPLACE FUNCTION public.require_paid_team_for_extra_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.product_type='grupo-adicional' AND NEW.status='completed' AND NOT EXISTS(
    SELECT 1 FROM public.user_subscriptions subscription
    WHERE subscription.user_id=NEW.purchased_by
      AND subscription.status='active' AND subscription.plan_type IN ('team','premium')
      AND (subscription.current_period_end IS NULL OR subscription.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Hazte Team para crear un grupo extra.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS require_paid_team_for_extra_group ON public.pro_shop_purchases;
CREATE TRIGGER require_paid_team_for_extra_group
BEFORE INSERT OR UPDATE OF product_type,status,purchased_by ON public.pro_shop_purchases
FOR EACH ROW EXECUTE FUNCTION public.require_paid_team_for_extra_group();

REVOKE ALL ON FUNCTION public.guard_one_active_owned_group() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.require_paid_team_for_extra_group() FROM PUBLIC,anon;

COMMIT;
