BEGIN;

CREATE OR REPLACE FUNCTION public.delete_rejected_group_invitation(
  p_group uuid,
  p_user uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  PERFORM public.require_group_manager(p_group);

  DELETE FROM public.group_invitations
  WHERE group_id=p_group
    AND invited_user_id=p_user
    AND status='rejected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La invitación rechazada ya no está disponible';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.delete_rejected_group_invitation(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_rejected_group_invitation(uuid,uuid) TO authenticated;

COMMIT;
