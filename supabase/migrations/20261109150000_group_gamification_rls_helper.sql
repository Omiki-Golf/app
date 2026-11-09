BEGIN;

-- Las políticas de group_gamification llamaban a can_manage_group_messages(), que es
-- interna de mensajería y no se puede ejecutar como authenticated: toda lectura o
-- escritura con sesión fallaba con "permission denied for function". Se usa un helper
-- propio que solo responde si el usuario gestiona ese grupo (creador o admin).
CREATE OR REPLACE FUNCTION public.can_manage_group_gamification(p_group uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.can_manage_group_messages(p_group);
$$;
REVOKE ALL ON FUNCTION public.can_manage_group_gamification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_group_gamification(uuid) TO authenticated;

DROP POLICY IF EXISTS group_gamification_read ON public.group_gamification;
DROP POLICY IF EXISTS group_gamification_manage ON public.group_gamification;
CREATE POLICY group_gamification_read ON public.group_gamification FOR SELECT TO authenticated
USING (public.is_group_member(group_id) OR public.can_manage_group_gamification(group_id));
CREATE POLICY group_gamification_manage ON public.group_gamification FOR ALL TO authenticated
USING (public.can_manage_group_gamification(group_id))
WITH CHECK (public.can_manage_group_gamification(group_id) AND updated_by=auth.uid());

COMMIT;
