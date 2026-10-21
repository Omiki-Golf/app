BEGIN;

CREATE OR REPLACE FUNCTION public.list_identified_group_members(p_group uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_group_member(p_group) OR public.can_manage_group_messages(p_group)) THEN
  RAISE EXCEPTION 'No tienes acceso a los jugadores de este grupo' USING ERRCODE='42501';
 END IF;
 RETURN coalesce((
  SELECT jsonb_agg(item ORDER BY joined_at,id) FROM (
   SELECT m.joined_at,m.id::text AS id,jsonb_build_object(
    'id',m.id,'group_id',m.group_id,'user_id',m.user_id,'role',CASE WHEN g.user_auth_id=m.user_id THEN 'admin' ELSE m.role END,
    'is_guest',false,'joined_at',m.joined_at,'member_revision',m.member_revision,'player_id',p.id,'player_revision',p.member_revision,
    'handicap_18',CASE WHEN p.handicap_pending THEN NULL ELSE p.exact_handicap*2 END,
    'can_manage',public.can_manage_group_messages(p_group) AND NOT public.is_app_user_read_only(),
    'can_remove',g.user_auth_id IS DISTINCT FROM m.user_id AND m.user_id<>auth.uid(),
    'profile',CASE WHEN u.user_id IS NULL THEN NULL ELSE jsonb_build_object('nick',u.nick,'display_name',u.display_name,'avatar_url',u.avatar_url) END
   ) AS item
   FROM public.group_members m JOIN public.groups g ON g.id=m.group_id
   JOIN public.players p ON p.group_id=m.group_id AND p.auth_user_id=m.user_id
   LEFT JOIN public.user_profiles u ON u.user_id=m.user_id WHERE m.group_id=p_group
   UNION ALL
   SELECT p.created_at,'guest:'||p.id::text,jsonb_build_object(
    'id','guest:'||p.id::text,'group_id',p.group_id,'user_id',NULL,'role','member','is_guest',true,
    'joined_at',p.created_at,'member_revision',0,'player_id',p.id,'player_revision',p.member_revision,
    'handicap_18',CASE WHEN p.handicap_pending THEN NULL ELSE p.exact_handicap*2 END,
    'can_manage',public.can_manage_group_messages(p_group) AND NOT public.is_app_user_read_only(),
    'can_remove',public.can_manage_group_messages(p_group) AND NOT public.is_app_user_read_only(),
    'profile',jsonb_build_object('nick',p.name,'display_name',NULL,'avatar_url',NULL)
   ) AS item
   FROM public.players p WHERE p.group_id=p_group AND p.auth_user_id IS NULL
  ) roster
 ),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.manage_group_guest_player(
 p_group uuid,p_player uuid,p_player_revision bigint,p_action text,p_handicap_18 numeric DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players;
BEGIN
 PERFORM public.require_group_manager(p_group);
 SELECT * INTO p FROM public.players WHERE id=p_player AND group_id=p_group AND auth_user_id IS NULL FOR UPDATE;
 IF p.id IS NULL OR p.member_revision IS DISTINCT FROM p_player_revision THEN
  RAISE EXCEPTION 'El jugador ha cambiado. Actualiza la lista y revisa de nuevo.' USING ERRCODE='40001';
 END IF;
 IF p_action='handicap' THEN
  IF p_handicap_18 IS NULL OR NOT (p_handicap_18 BETWEEN 0 AND 54) THEN RAISE EXCEPTION 'El hándicap debe estar entre 0 y 54'; END IF;
  UPDATE public.players SET exact_handicap=round(p_handicap_18/2),exact_handicap_18=round(p_handicap_18/2),playing_handicap=round(p_handicap_18/2),handicap_pending=false WHERE id=p.id;
 ELSIF p_action='remove' THEN
  UPDATE public.players SET group_id=NULL WHERE id=p.id;
 ELSE RAISE EXCEPTION 'Operación no válida'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.manage_group_guest_player(uuid,uuid,bigint,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_group_guest_player(uuid,uuid,bigint,text,numeric) TO authenticated;

COMMIT;
