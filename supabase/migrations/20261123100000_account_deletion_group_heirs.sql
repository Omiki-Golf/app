-- Baja del creador: qué pasa con sus grupos.
--  * Archivados: solo se consultan. Se quedan sin creador, sin traspaso ni avisos.
--  * Activos (también Weekend): los hereda primero un administrador con Team o Premium
--    y hueco en su plan; si no hay, el miembro con Team o Premium más antiguo.
--    Si ningún miembro puede heredarlo, el grupo se borra del todo y se avisa a sus miembros.
-- La vista previa usa la misma regla (account_deletion_heir), así que anuncia lo que pasará.
--
-- Envuelve la baja actual: reparte los grupos antes de llamar a la versión anterior,
-- cuyo reparto propio ya no encuentra grupos del usuario.

-- Quién heredaría el grupo: Team o Premium activo y hueco para un grupo así.
-- Repite las comprobaciones de guard_one_active_owned_group para que el traspaso no falle.
CREATE OR REPLACE FUNCTION public.account_deletion_heir(p_group uuid, p_leaver uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT m.user_id
  FROM public.group_members m
  JOIN public.groups g ON g.id=m.group_id
  JOIN public.user_subscriptions s ON s.user_id=m.user_id
  WHERE m.group_id=p_group AND m.user_id IS NOT NULL AND m.user_id<>p_leaver
    AND s.status='active' AND s.plan_type IN ('team','premium')
    AND (s.current_period_end IS NULL OR s.current_period_end>clock_timestamp())
    AND CASE WHEN g.group_type='weekend' THEN NOT EXISTS(
          SELECT 1 FROM public.groups o
          WHERE o.user_auth_id=m.user_id AND o.archived_at IS NULL AND o.id<>g.id
            AND o.group_type='weekend' AND o.weekend_days=g.weekend_days
            AND o.weekend_mode_until>clock_timestamp())
        ELSE (
          SELECT count(*) FROM public.groups o
          WHERE o.user_auth_id=m.user_id AND o.archived_at IS NULL AND o.id<>g.id
            AND o.group_type IS DISTINCT FROM 'weekend'
        ) < (
          SELECT least(3,1+count(*)) FROM public.pro_shop_purchases purchase
          JOIN public.groups owned ON owned.id=purchase.group_id
          WHERE owned.user_auth_id=m.user_id AND owned.group_type IS DISTINCT FROM 'weekend'
            AND purchase.product_type='grupo-adicional' AND purchase.status='completed'
        ) END
  ORDER BY (m.role='admin') DESC, m.joined_at, m.user_id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.account_deletion_heir(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Borra un grupo con sus partidas e historial (como delete_archived_owned_group, sin sus permisos).
CREATE OR REPLACE FUNCTION public.purge_group_for_account_deletion(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['players','group_members','group_invitations','golf_rounds','round_players','round_scores','archived_rounds','handicap_adjustments'] LOOP
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER',table_name);
 END LOOP;
 DELETE FROM public.groups WHERE id=p_group;
 FOREACH table_name IN ARRAY ARRAY['handicap_adjustments','archived_rounds','round_scores','round_players','golf_rounds','group_invitations','group_members','players'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER',table_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.purge_group_for_account_deletion(uuid) FROM PUBLIC,anon,authenticated;

-- Vista previa: por cada grupo propio, si está archivado, su heredero o si se borrará.
CREATE OR REPLACE FUNCTION public.account_deletion_preview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'is_app_admin', EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid()),
    'groups', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', coalesce(g.name, g.group_code),
        'archived', g.archived_at IS NOT NULL,
        'members', (SELECT count(*) FROM public.group_members m WHERE m.group_id=g.id AND m.user_id<>auth.uid()),
        'admin', CASE WHEN g.archived_at IS NULL THEN (
                   SELECT jsonb_build_object('user_id', h.heir, 'nick', coalesce(nullif(p.nick,''),'Jugador'))
                   FROM (SELECT public.account_deletion_heir(g.id, auth.uid()) AS heir) h
                   LEFT JOIN public.user_profiles p ON p.user_id=h.heir
                   WHERE h.heir IS NOT NULL) END,
        'will_delete', g.archived_at IS NULL AND public.account_deletion_heir(g.id, auth.uid()) IS NULL
      ) ORDER BY g.created_at)
      FROM public.groups g WHERE g.user_auth_id=auth.uid()
    ), '[]'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.account_deletion_preview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_preview() TO authenticated;

ALTER FUNCTION public.delete_account_data(uuid) RENAME TO delete_account_data_before_group_heirs;

CREATE FUNCTION public.delete_account_data(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 result jsonb; g record; v_nick text; v_heir uuid; v_heir_nick text; v_members uuid[]; v_others uuid[];
 v_archived int := 0; v_transferred int := 0; v_deleted int := 0;
BEGIN
 IF p_user IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN
  RAISE EXCEPTION 'Cuenta no encontrada' USING ERRCODE='P0002';
 END IF;
 IF EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=p_user) THEN
  RAISE EXCEPTION 'Las cuentas de administración no pueden darse de baja desde la app' USING ERRCODE='42501';
 END IF;

 PERFORM pg_advisory_xact_lock(20260910,1900);
 PERFORM set_config('app.account_deletion','on',true);
 SELECT coalesce(nullif(trim(nick),''), nullif(trim(display_name),''), 'El creador') INTO v_nick
 FROM public.user_profiles WHERE user_id=p_user;
 v_nick := coalesce(v_nick,'El creador');

 -- Archivados: solo consulta.
 UPDATE public.groups SET user_auth_id=NULL WHERE user_auth_id=p_user AND archived_at IS NOT NULL;
 GET DIAGNOSTICS v_archived=ROW_COUNT;

 -- Activos: heredero con plan, o borrado.
 FOR g IN SELECT id, coalesce(name, group_code) AS name FROM public.groups
          WHERE user_auth_id=p_user AND archived_at IS NULL ORDER BY created_at, id LOOP
  SELECT array_agg(user_id) INTO v_members FROM public.group_members WHERE group_id=g.id AND user_id<>p_user;
  v_heir := public.account_deletion_heir(g.id, p_user);
  IF v_heir IS NOT NULL THEN
   SELECT coalesce(nullif(nick,''),'Jugador') INTO v_heir_nick FROM public.user_profiles WHERE user_id=v_heir;
   UPDATE public.groups SET user_auth_id=v_heir WHERE id=g.id;
   UPDATE public.group_members SET role='admin' WHERE group_id=g.id AND user_id=v_heir AND role<>'admin';
   v_transferred := v_transferred + 1;
   PERFORM public.notify_account_deletion(p_user, g.id,
     format('Ahora eres el creador de %s', g.name),
     format('%s se ha dado de baja de Omiki Golf y ahora eres el creador del grupo %s. Nombra a otro jugador como administrador desde Mis grupos → Jugadores y administradores.', v_nick, g.name),
     ARRAY[v_heir]);
   SELECT array_agg(x) INTO v_others FROM unnest(coalesce(v_members,'{}')) x WHERE x<>v_heir;
   PERFORM public.notify_account_deletion(p_user, g.id,
     format('Nuevo creador en %s', g.name),
     format('El creador %s se ha dado de baja de Omiki Golf. El nuevo creador del grupo %s es %s.', v_nick, g.name, coalesce(v_heir_nick,'otro jugador')),
     v_others);
  ELSE
   PERFORM public.notify_account_deletion(p_user, NULL,
     format('%s se ha eliminado', g.name),
     format('El creador %s se ha dado de baja de Omiki Golf. Ningún miembro tenía Team o Premium para quedarse el grupo %s, así que se ha eliminado con sus partidas y clasificaciones.', v_nick, g.name),
     v_members);
   PERFORM public.purge_group_for_account_deletion(g.id);
   v_deleted := v_deleted + 1;
  END IF;
 END LOOP;
 PERFORM set_config('app.account_deletion','off',true);

 result := public.delete_account_data_before_group_heirs(p_user);
 RETURN coalesce(result,'{}'::jsonb) || jsonb_build_object(
   'groups_transferred', v_transferred,
   'groups_deleted', v_deleted,
   'groups_without_owner', 0,
   'archived_groups_kept', v_archived);
END $$;

REVOKE ALL ON FUNCTION public.delete_account_data(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.delete_account_data_before_group_heirs(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data_before_group_heirs(uuid) TO service_role;
