-- Un Premium conserva un único grupo Premium; sus plazas adicionales son Team.
-- Gamificación y Grupo Adicional pertenecen a la cuenta. Plantilla y temporadas,
-- en cambio, siguen perteneciendo al grupo seleccionado. Weekend queda fuera de
-- los beneficios globales y nunca puede ser el soporte de Grupo Adicional.
BEGIN;

-- Corrige el resultado de la regla anterior: por cada cuenta solo el grupo Premium
-- activo más antiguo conserva el rosa; los demás grupos activos pasan a Team.
WITH premium_groups AS (
  SELECT g.id,row_number() OVER(PARTITION BY g.user_auth_id ORDER BY g.created_at,g.id) AS position
  FROM public.groups g
  WHERE g.archived_at IS NULL AND g.group_type IS DISTINCT FROM 'weekend' AND g.premium_branding
)
UPDATE public.groups g SET premium_branding=false
FROM premium_groups ranked WHERE ranked.id=g.id AND ranked.position>1;

-- Lo contratado hasta ahora en cualquiera de los grupos normales se reconoce en
-- todos los Team/Premium activos del mismo creador. Cada grupo conserva después
-- su capacidad de activar o desactivar el título desde Configuración.
INSERT INTO public.group_gamification(group_id,product_id,purchased,enabled,updated_at)
SELECT target.id,owned_product.product_id,true,true,now()
FROM public.groups target
JOIN (
  SELECT DISTINCT source.user_auth_id,gg.product_id
  FROM public.groups source
  JOIN public.group_gamification gg ON gg.group_id=source.id AND gg.purchased
  WHERE source.archived_at IS NULL AND source.group_type IS DISTINCT FROM 'weekend'
    AND gg.product_id<>'no-paso-rojas'
) owned_product ON owned_product.user_auth_id=target.user_auth_id
WHERE target.archived_at IS NULL AND target.group_type IS DISTINCT FROM 'weekend'
ON CONFLICT(group_id,product_id) DO UPDATE SET purchased=true,updated_at=now();

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
    NEW.premium_branding:=false;
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

  IF TG_OP='INSERT' THEN
    -- El primer hueco de Premium es rosa. Cualquier hueco comprado después es Team verde.
    NEW.premium_branding := v_paid_team AND v_plan='premium' AND NOT EXISTS(
      SELECT 1 FROM public.groups g
      WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL
        AND g.group_type IS DISTINCT FROM 'weekend' AND g.premium_branding
    );
  END IF;

  IF v_paid_team THEN
    SELECT 1 + count(*) INTO v_capacity
    FROM public.pro_shop_purchases purchase
    JOIN public.groups owned ON owned.id=purchase.group_id
    WHERE owned.user_auth_id=NEW.user_auth_id
      AND owned.group_type IS DISTINCT FROM 'weekend'
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

-- Una sola operación gestiona la capacidad global. La fila se ancla al grupo
-- Team/Premium principal solo porque la tabla histórica exige group_id.
CREATE OR REPLACE FUNCTION public.set_additional_group_for_testing(p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_anchor uuid; v_active_groups integer;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar ampliaciones' USING ERRCODE='42501';
  END IF;
  IF p_enabled AND NOT EXISTS(
    SELECT 1 FROM public.user_subscriptions subscription
    WHERE subscription.user_id=auth.uid() AND subscription.status='active'
      AND subscription.plan_type IN ('team','premium')
      AND (subscription.current_period_end IS NULL OR subscription.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Necesitas Team o Premium para crear un grupo adicional.' USING ERRCODE='42501';
  END IF;

  SELECT g.id INTO v_anchor FROM public.groups g
  WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL
    AND g.group_type IS DISTINCT FROM 'weekend'
  ORDER BY g.premium_branding DESC,g.created_at,g.id LIMIT 1 FOR UPDATE;
  IF p_enabled AND v_anchor IS NULL THEN
    RAISE EXCEPTION 'Crea primero tu Team o Premium.';
  END IF;

  SELECT count(*) INTO v_active_groups FROM public.groups g
  WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL
    AND g.group_type IS DISTINCT FROM 'weekend';
  IF NOT p_enabled AND v_active_groups>1 THEN
    RAISE EXCEPTION 'Archiva el Team adicional antes de retirar Grupo Adicional.';
  END IF;

  DELETE FROM public.pro_shop_purchases purchase USING public.groups owned
  WHERE purchase.group_id=owned.id AND owned.user_auth_id=auth.uid()
    AND purchase.product_type='grupo-adicional';
  IF p_enabled THEN
    INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
    VALUES(v_anchor,auth.uid(),'grupo-adicional',0,'test','completed');
  END IF;
END $$;

-- Esta RPC solo toca ampliaciones específicas del grupo; nunca la capacidad global.
CREATE OR REPLACE FUNCTION public.activate_group_addons_for_testing(p_group uuid,p_product_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_owner uuid;
  v_allowed constant text[] := ARRAY['ampliacion-plantilla','temporada-simultanea'];
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar ampliaciones' USING ERRCODE='42501';
  END IF;
  SELECT user_auth_id INTO v_owner FROM public.groups WHERE id=p_group AND archived_at IS NULL FOR UPDATE;
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo el creador puede activar ampliaciones para el grupo' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(coalesce(p_product_ids,ARRAY[]::text[])) product WHERE NOT product=ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Ampliación no válida';
  END IF;

  DELETE FROM public.pro_shop_purchases
  WHERE group_id=p_group AND product_type=ANY(v_allowed);
  INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
  SELECT p_group,auth.uid(),product,0,'test','completed'
  FROM unnest(coalesce(p_product_ids,ARRAY[]::text[])) product;

  UPDATE public.groups SET
    max_players=CASE WHEN 'ampliacion-plantilla'=ANY(coalesce(p_product_ids,ARRAY[]::text[])) THEN 32 ELSE 20 END,
    simultaneous_season_enabled='temporada-simultanea'=ANY(coalesce(p_product_ids,ARRAY[]::text[]))
  WHERE id=p_group;

  RETURN jsonb_build_object(
    'max_players',CASE WHEN 'ampliacion-plantilla'=ANY(coalesce(p_product_ids,ARRAY[]::text[])) THEN 32 ELSE 20 END,
    'simultaneous_season','temporada-simultanea'=ANY(coalesce(p_product_ids,ARRAY[]::text[]))
  );
END $$;

CREATE OR REPLACE FUNCTION public.activate_account_gamification(p_product_ids text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owned record;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar la gamificación' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.groups g WHERE g.user_auth_id=auth.uid()
      AND g.archived_at IS NULL AND g.group_type IS DISTINCT FROM 'weekend'
  ) THEN RAISE EXCEPTION 'Necesitas un Team o Premium activo.'; END IF;

  FOR owned IN SELECT g.id FROM public.groups g
    WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL
      AND g.group_type IS DISTINCT FROM 'weekend'
  LOOP
    PERFORM public.activate_group_gamification(owned.id,p_product_ids);
  END LOOP;
END $$;

-- Los Teams adicionales heredan automáticamente la selección global existente.
CREATE OR REPLACE FUNCTION public.seed_group_gamification_defaults() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.group_gamification(group_id,product_id,purchased,enabled)
  VALUES(NEW.id,'no-paso-rojas',true,coalesce(NEW.hoyo_19_enabled,false))
  ON CONFLICT DO NOTHING;
  IF NEW.group_type IS DISTINCT FROM 'weekend' THEN
    INSERT INTO public.group_gamification(group_id,product_id,purchased,enabled)
    SELECT NEW.id,gg.product_id,true,true
    FROM public.group_gamification gg
    JOIN public.groups source ON source.id=gg.group_id
    WHERE source.user_auth_id=NEW.user_auth_id AND source.id<>NEW.id
      AND source.archived_at IS NULL AND source.group_type IS DISTINCT FROM 'weekend'
      AND gg.purchased AND gg.product_id<>'no-paso-rojas'
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_one_active_owned_group ON public.groups;
CREATE TRIGGER guard_one_active_owned_group
BEFORE INSERT OR UPDATE OF user_auth_id,archived_at,group_type ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.guard_one_active_owned_group();

REVOKE ALL ON FUNCTION public.guard_one_active_owned_group() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_additional_group_for_testing(boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.activate_group_addons_for_testing(uuid,text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.activate_account_gamification(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_additional_group_for_testing(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_group_addons_for_testing(uuid,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_account_gamification(text[]) TO authenticated;

COMMIT;
