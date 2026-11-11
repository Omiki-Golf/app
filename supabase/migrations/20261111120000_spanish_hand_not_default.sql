BEGIN;

-- Solo "No paso de Rojas" viene incluido por defecto en cada grupo. Spanish Hand y el
-- resto de títulos se contratan desde el Pro-Shop (activate_group_gamification).
CREATE OR REPLACE FUNCTION public.seed_group_gamification_defaults() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.group_gamification(group_id, product_id, purchased, enabled)
  VALUES (NEW.id, 'no-paso-rojas', true, coalesce(NEW.hoyo_19_enabled, false))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.seed_group_gamification_defaults() FROM PUBLIC,anon,authenticated;

-- Retira el Spanish Hand que se sembró por defecto (20261109120000 y 20261109140000).
-- Esas filas nunca las ha tocado nadie (updated_by NULL); lo contratado desde el
-- Pro-Shop o ajustado por el creador tiene updated_by y se respeta.
UPDATE public.group_gamification
SET purchased=false, enabled=false, updated_at=now()
WHERE product_id='spanish-hand' AND purchased AND updated_by IS NULL;

COMMIT;
