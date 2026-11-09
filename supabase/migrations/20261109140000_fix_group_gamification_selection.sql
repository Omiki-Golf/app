BEGIN;

-- Pro-Shop: guarda la selección de títulos SOLO en el grupo indicado (la versión
-- anterior la aplicaba a todos los grupos del creador y no retiraba lo desmarcado).
-- Lo seleccionado queda contratado; si ya lo estaba, se respeta si el creador lo
-- tenía desactivado en Configuración del grupo. Lo desmarcado deja de estar contratado.
CREATE OR REPLACE FUNCTION public.activate_group_gamification(
  p_group uuid,
  p_product_ids text[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  invalid_product text;
  selected text[] := coalesce(p_product_ids, '{}'::text[]);
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() OR NOT EXISTS(
    SELECT 1 FROM public.groups g WHERE g.id=p_group AND g.user_auth_id=auth.uid() AND g.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el creador puede activar la gamificación contratada en este grupo' USING ERRCODE='42501';
  END IF;

  SELECT product_id INTO invalid_product
  FROM unnest(selected) product_id
  WHERE product_id NOT IN ('spanish-hand','buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos')
  LIMIT 1;
  IF invalid_product IS NOT NULL THEN
    RAISE EXCEPTION 'Producto de gamificación no válido: %', invalid_product USING ERRCODE='22023';
  END IF;

  INSERT INTO public.group_gamification AS gg(group_id, product_id, purchased, enabled, updated_by, updated_at)
  SELECT DISTINCT p_group, product_id, true, true, auth.uid(), now()
  FROM unnest(selected) product_id
  ON CONFLICT(group_id, product_id) DO UPDATE SET
    purchased=true,
    enabled=CASE WHEN gg.purchased THEN gg.enabled ELSE true END,
    updated_by=auth.uid(),
    updated_at=now();

  UPDATE public.group_gamification
  SET purchased=false, enabled=false, updated_by=auth.uid(), updated_at=now()
  WHERE group_id=p_group
    AND product_id <> 'no-paso-rojas'
    AND purchased
    AND NOT (product_id = ANY(selected));
END $$;

REVOKE ALL ON FUNCTION public.activate_group_gamification(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_group_gamification(uuid,text[]) TO authenticated;

-- "No paso de Rojas" se activa/desactiva desde Configuración del grupo: se refleja
-- en groups.hoyo_19_enabled, que es el indicador que ya usa el resto de la app.
CREATE OR REPLACE FUNCTION public.sync_group_hoyo19_from_gamification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.product_id='no-paso-rojas' THEN
    UPDATE public.groups SET hoyo_19_enabled=(NEW.purchased AND NEW.enabled)
    WHERE id=NEW.group_id AND hoyo_19_enabled IS DISTINCT FROM (NEW.purchased AND NEW.enabled);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_group_hoyo19_from_gamification() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sync_group_hoyo19_from_gamification ON public.group_gamification;
CREATE TRIGGER sync_group_hoyo19_from_gamification AFTER INSERT OR UPDATE OF purchased, enabled ON public.group_gamification
FOR EACH ROW EXECUTE FUNCTION public.sync_group_hoyo19_from_gamification();

-- Grupos nuevos: mismos valores por defecto que recibieron los existentes.
CREATE OR REPLACE FUNCTION public.seed_group_gamification_defaults() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.group_gamification(group_id, product_id, purchased, enabled)
  VALUES (NEW.id, 'no-paso-rojas', true, coalesce(NEW.hoyo_19_enabled, false)),
         (NEW.id, 'spanish-hand', true, true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.seed_group_gamification_defaults() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS seed_group_gamification_defaults ON public.groups;
CREATE TRIGGER seed_group_gamification_defaults AFTER INSERT ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.seed_group_gamification_defaults();

-- Grupos creados después de 20261109120000 que se quedaron sin filas por defecto.
INSERT INTO public.group_gamification(group_id, product_id, purchased, enabled)
SELECT id, 'no-paso-rojas', true, coalesce(hoyo_19_enabled, false) FROM public.groups ON CONFLICT DO NOTHING;
INSERT INTO public.group_gamification(group_id, product_id, purchased, enabled)
SELECT id, 'spanish-hand', true, true FROM public.groups ON CONFLICT DO NOTHING;

COMMIT;
