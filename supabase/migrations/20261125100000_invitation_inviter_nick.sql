-- Nick de quien te invita a un grupo. Los perfiles ajenos no se pueden leer, así que el
-- aviso decía «la invitación de alguien». Solo devuelve el nick de tus invitaciones pendientes.
BEGIN;

CREATE OR REPLACE FUNCTION public.pending_invitation_inviters()
RETURNS TABLE(invitation_id uuid, inviter_nick text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT i.id, coalesce(nullif(trim(p.nick), ''), nullif(trim(p.display_name), ''))
  FROM public.group_invitations i
  LEFT JOIN public.user_profiles p ON p.user_id = i.invited_by
  WHERE i.invited_user_id = auth.uid() AND i.status = 'pending'
$$;
REVOKE ALL ON FUNCTION public.pending_invitation_inviters() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_invitation_inviters() TO authenticated;

COMMIT;
