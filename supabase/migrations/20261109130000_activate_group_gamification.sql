BEGIN;

CREATE OR REPLACE FUNCTION public.activate_group_gamification(
  p_group uuid,
  p_product_ids text[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invalid_product text;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() OR NOT EXISTS(
    SELECT 1 FROM public.groups g WHERE g.id=p_group AND g.user_auth_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Solo el creador puede activar la gamificación contratada en este grupo' USING ERRCODE='42501';
  END IF;

  SELECT product_id INTO invalid_product
  FROM unnest(coalesce(p_product_ids, '{}'::text[])) product_id
  WHERE product_id NOT IN ('spanish-hand','buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos')
  LIMIT 1;
  IF invalid_product IS NOT NULL THEN
    RAISE EXCEPTION 'Producto de gamificación no válido: %', invalid_product USING ERRCODE='22023';
  END IF;

  INSERT INTO public.group_gamification(group_id, product_id, purchased, enabled, updated_by, updated_at)
  SELECT g.id, product_id, true, true, auth.uid(), now()
  FROM public.groups g
  CROSS JOIN unnest(coalesce(p_product_ids, '{}'::text[])) product_id
  WHERE g.user_auth_id=auth.uid()
  ON CONFLICT(group_id, product_id) DO UPDATE SET
    purchased=true, enabled=true, updated_by=auth.uid(), updated_at=now();
END $$;

REVOKE ALL ON FUNCTION public.activate_group_gamification(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_group_gamification(uuid,text[]) TO authenticated;

COMMIT;
