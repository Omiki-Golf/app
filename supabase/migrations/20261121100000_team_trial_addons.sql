-- La prueba Team solo permite comprar títulos. Grupo Adicional, Ampliación de Plantilla
-- y Temporada Simultánea de un grupo Team requieren Team o Premium de pago.
-- Los grupos Weekend mantienen sus ampliaciones. Lo ya comprado no se toca.
BEGIN;

CREATE OR REPLACE FUNCTION public.activate_group_addons_for_testing(p_group uuid,p_product_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_owner uuid;
  v_allowed constant text[] := ARRAY['ampliacion-plantilla','temporada-simultanea'];
  v_roster boolean;
  v_season boolean;
  v_weekend boolean;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar ampliaciones' USING ERRCODE='42501';
  END IF;
  SELECT user_auth_id,group_type='weekend' INTO v_owner,v_weekend FROM public.groups WHERE id=p_group AND archived_at IS NULL FOR UPDATE;
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo el creador puede activar ampliaciones para el grupo' USING ERRCODE='42501';
  END IF;
  -- La prueba Team solo permite títulos: las ampliaciones de un Team requieren Team o Premium de pago.
  IF NOT coalesce(v_weekend,false) AND EXISTS(
    SELECT 1 FROM unnest(coalesce(p_product_ids,ARRAY[]::text[])) product
    WHERE NOT EXISTS(SELECT 1 FROM public.pro_shop_purchases existing
      WHERE existing.group_id=p_group AND existing.product_type=product AND existing.status='completed')
  ) AND NOT EXISTS(
    SELECT 1 FROM public.user_subscriptions s
    WHERE s.user_id=auth.uid() AND s.status='active' AND s.plan_type IN ('team','premium')
      AND (s.current_period_end IS NULL OR s.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Pasa a Team completo para ampliar tu grupo.' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(coalesce(p_product_ids,ARRAY[]::text[])) product WHERE NOT product=ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Ampliación no válida';
  END IF;

  INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
  SELECT DISTINCT p_group,auth.uid(),product,0,'test','completed'
  FROM unnest(coalesce(p_product_ids,ARRAY[]::text[])) product
  WHERE NOT EXISTS(
    SELECT 1 FROM public.pro_shop_purchases existing
    WHERE existing.group_id=p_group AND existing.product_type=product AND existing.status='completed'
  );

  SELECT bool_or(product_type='ampliacion-plantilla'),bool_or(product_type='temporada-simultanea')
  INTO v_roster,v_season
  FROM public.pro_shop_purchases WHERE group_id=p_group AND status='completed';
  UPDATE public.groups SET
    max_players=CASE WHEN coalesce(v_roster,false) THEN 32 ELSE 20 END,
    simultaneous_season_enabled=coalesce(v_season,false)
  WHERE id=p_group;
  RETURN jsonb_build_object(
    'max_players',CASE WHEN coalesce(v_roster,false) THEN 32 ELSE 20 END,
    'simultaneous_season',coalesce(v_season,false)
  );
END $$;


CREATE OR REPLACE FUNCTION public.add_additional_group_for_testing()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_anchor uuid; v_count integer;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar ampliaciones' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.user_subscriptions subscription
    WHERE subscription.user_id=auth.uid() AND subscription.status='active'
      AND subscription.plan_type IN ('team','premium')
      AND (subscription.current_period_end IS NULL OR subscription.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Pasa a Team completo para contratar Grupos Adicionales.' USING ERRCODE='42501';
  END IF;
  SELECT g.id INTO v_anchor FROM public.groups g
  WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL
    AND g.group_type IS DISTINCT FROM 'weekend'
  ORDER BY g.premium_branding DESC,g.created_at,g.id LIMIT 1 FOR UPDATE;
  IF v_anchor IS NULL THEN RAISE EXCEPTION 'Crea primero tu Team o Premium.'; END IF;

  SELECT count(*) INTO v_count
  FROM public.pro_shop_purchases purchase
  JOIN public.groups owned ON owned.id=purchase.group_id
  WHERE owned.user_auth_id=auth.uid() AND owned.group_type IS DISTINCT FROM 'weekend'
    AND purchase.product_type='grupo-adicional' AND purchase.status='completed';
  IF v_count>=2 THEN
    RAISE EXCEPTION 'Ya tienes tus 2 Grupos Adicionales: tu plan admite 3 grupos.' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
  VALUES(v_anchor,auth.uid(),'grupo-adicional',0,'test','completed');
  RETURN v_count+1;
END $$;


REVOKE ALL ON FUNCTION public.activate_group_addons_for_testing(uuid,text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.add_additional_group_for_testing() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_group_addons_for_testing(uuid,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_additional_group_for_testing() TO authenticated;

COMMIT;
