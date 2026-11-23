BEGIN;

-- Solo el creador del grupo puede cambiarle el nombre, y solo mientras el grupo está activo.
CREATE OR REPLACE FUNCTION public.rename_owned_group(p_group uuid, p_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 clean_name text := btrim(coalesce(p_name, ''));
 target record;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
  RAISE EXCEPTION 'No tienes permiso para renombrar grupos' USING ERRCODE='42501';
 END IF;
 IF clean_name = '' THEN RAISE EXCEPTION 'El nombre del grupo es obligatorio' USING ERRCODE='22023'; END IF;
 IF char_length(clean_name) > 60 THEN RAISE EXCEPTION 'El nombre del grupo admite como máximo 60 caracteres' USING ERRCODE='22023'; END IF;
 SELECT g.user_auth_id, g.archived_at INTO target FROM public.groups g WHERE g.id = p_group;
 IF NOT FOUND OR target.user_auth_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Solo el creador del grupo puede cambiarle el nombre' USING ERRCODE='42501';
 END IF;
 IF target.archived_at IS NOT NULL THEN
  RAISE EXCEPTION 'El grupo está archivado y no admite cambios' USING ERRCODE='42501';
 END IF;
 UPDATE public.groups SET name = clean_name WHERE id = p_group;
 RETURN clean_name;
END $$;

REVOKE ALL ON FUNCTION public.rename_owned_group(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_owned_group(uuid, text) TO authenticated;

COMMIT;
