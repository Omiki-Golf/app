-- Weekend es un extra: da un grupo propio aparte, aunque el usuario ya tenga el grupo de su plan.
-- La capacidad del plan (1 + "Grupo adicional" del Pro-Shop) solo cuenta los grupos que no son Weekend.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_one_active_owned_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_capacity integer; v_weekend_until timestamptz;
BEGIN
  IF NEW.user_auth_id IS NULL OR NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.group_type='weekend' THEN
    -- Al crear un grupo Weekend (o convertir uno en Weekend) hace falta un Weekend vigente,
    -- y el grupo hereda su fecha de fin del servidor, no del cliente.
    IF TG_OP='INSERT' OR OLD.group_type IS DISTINCT FROM 'weekend' THEN
      SELECT weekend_mode_until INTO v_weekend_until FROM public.user_subscriptions WHERE user_id=NEW.user_auth_id;
      IF v_weekend_until IS NULL OR v_weekend_until<=clock_timestamp() THEN
        RAISE EXCEPTION 'Necesitas un Weekend activo para crear este grupo.';
      END IF;
      NEW.weekend_mode_until:=v_weekend_until;
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.groups g
      WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id
        AND g.group_type='weekend' AND g.weekend_mode_until>clock_timestamp()
    ) THEN
      RAISE EXCEPTION 'Ya tienes un grupo Weekend activo.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT 1 + count(*) INTO v_capacity
  FROM public.pro_shop_purchases purchase
  JOIN public.groups owned ON owned.id=purchase.group_id
  WHERE owned.user_auth_id=NEW.user_auth_id AND purchase.product_type='grupo-adicional' AND purchase.status='completed';
  IF (
    SELECT count(*) FROM public.groups g
    WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id
      AND g.group_type IS DISTINCT FROM 'weekend'
  )>=v_capacity THEN
    RAISE EXCEPTION 'Tu plan no dispone de más grupos activos.' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;

-- También se revisa al cambiar el tipo, para que no se libere capacidad marcando un grupo como Weekend.
DROP TRIGGER IF EXISTS guard_one_active_owned_group ON public.groups;
CREATE TRIGGER guard_one_active_owned_group BEFORE INSERT OR UPDATE OF user_auth_id,archived_at,group_type ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.guard_one_active_owned_group();

REVOKE ALL ON FUNCTION public.guard_one_active_owned_group() FROM PUBLIC,anon;

COMMIT;
