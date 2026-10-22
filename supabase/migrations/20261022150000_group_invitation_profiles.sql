-- The roster of a group shows its invitations (pending, accepted, rejected) with
-- the invited player's nick and avatar. user_profiles only lets each account read
-- its own row, so the client could read the invitation statuses but not the
-- invited profiles: invitations appeared right after sending and disappeared on
-- the next refresh. This function returns both, only to whoever may already see
-- those invitations (the inviter, a group admin or the group owner).

CREATE OR REPLACE FUNCTION public.list_group_invitations(p_group uuid)
RETURNS TABLE(
  invited_user_id uuid,
  status text,
  nick text,
  display_name text,
  avatar_url text,
  exact_handicap numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT i.invited_user_id, i.status, p.nick, p.display_name, p.avatar_url, p.exact_handicap
  FROM public.group_invitations i
  LEFT JOIN public.user_profiles p ON p.user_id = i.invited_user_id
  WHERE i.group_id = p_group
    AND auth.uid() IS NOT NULL
    AND (
      i.invited_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = p_group AND gm.user_id = auth.uid() AND gm.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = p_group AND g.user_auth_id = auth.uid()
      )
    )
  ORDER BY i.created_at;
$$;

REVOKE ALL ON FUNCTION public.list_group_invitations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_group_invitations(uuid) TO authenticated;
