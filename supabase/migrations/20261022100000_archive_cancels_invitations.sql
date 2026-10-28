BEGIN;

CREATE OR REPLACE FUNCTION public.archive_owned_group(p_group uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE archived timestamptz;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'No tienes permiso para archivar grupos' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.groups g WHERE g.id=p_group AND (g.user_auth_id=auth.uid() OR EXISTS(
  SELECT 1 FROM public.group_members m WHERE m.group_id=g.id AND m.user_id=auth.uid() AND m.role='admin'
 ))) THEN RAISE EXCEPTION 'Solo el propietario o un administrador puede archivar este grupo' USING ERRCODE='42501'; END IF;
 UPDATE public.groups SET archived_at=coalesce(archived_at,clock_timestamp()) WHERE id=p_group RETURNING archived_at INTO archived;
 -- Una invitación pendiente deja de ser accionable en cuanto el grupo se archiva.
 DELETE FROM public.group_invitations WHERE group_id=p_group AND status='pending';
 RETURN archived;
END $$;

COMMIT;
