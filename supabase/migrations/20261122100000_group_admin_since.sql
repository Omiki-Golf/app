-- Fecha en que un miembro pasó a administrador, para ordenar en Inicio los grupos que
-- administra. Se rellena sola al cambiar el rol y se vacía al dejar de ser administrador.
BEGIN;

ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS admin_since timestamptz;

CREATE OR REPLACE FUNCTION public.track_group_admin_since() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.role='admin' THEN
    IF TG_OP='INSERT' OR OLD.role IS DISTINCT FROM 'admin' THEN NEW.admin_since:=clock_timestamp(); END IF;
  ELSE
    NEW.admin_since:=NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS b_track_group_admin_since ON public.group_members;
CREATE TRIGGER b_track_group_admin_since
BEFORE INSERT OR UPDATE OF role ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.track_group_admin_since();

-- Administradores actuales: no se sabe cuándo se les nombró; se toma su fecha de entrada.
-- La marca de mantenimiento evita los guardas de edición de miembros, como en la baja.
SELECT set_config('app.account_deletion','on',true);
UPDATE public.group_members SET admin_since=joined_at WHERE role='admin' AND admin_since IS NULL;
SELECT set_config('app.account_deletion','off',true);

REVOKE ALL ON FUNCTION public.track_group_admin_since() FROM PUBLIC,anon,authenticated;

COMMIT;
