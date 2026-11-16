-- Abandono voluntario de grupos y avisos de cambios de membresía.
-- La ficha de jugador se conserva para no alterar partidas ni estadísticas históricas.
BEGIN;

-- El abandono voluntario es la única escritura admitida en una membresía de un
-- grupo archivado. El resto del grupo continúa estrictamente en modo consulta.
CREATE OR REPLACE FUNCTION public.guard_archived_group_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_group uuid;
BEGIN
 IF current_setting('app.account_deletion',true)='on'
    OR current_setting('app.group_self_leave',true)='on' THEN
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 target_group:=CASE WHEN TG_OP='DELETE' THEN OLD.group_id ELSE NEW.group_id END;
 IF target_group IS NOT NULL AND EXISTS(SELECT 1 FROM public.groups WHERE id=target_group AND archived_at IS NOT NULL) THEN
  RAISE EXCEPTION 'El grupo está archivado y solo se puede consultar' USING ERRCODE='42501';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

-- Aviso interno best-effort: si la cuenta ya no existe o el buzón no está
-- disponible, el cambio de membresía no se revierte.
CREATE OR REPLACE FUNCTION public.notify_group_membership_accounts(
 p_author uuid,p_group uuid,p_title text,p_body text,p_recipients uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid:=gen_random_uuid(); v_recipients jsonb;
BEGIN
 SELECT jsonb_agg(jsonb_build_object(
   'kind','user','id',recipient.id,'label',coalesce(nullif(profile.nick,''),'Jugador')
 ) ORDER BY recipient.id)
 INTO v_recipients
 FROM (SELECT DISTINCT unnest(coalesce(p_recipients,ARRAY[]::uuid[])) AS id) recipient
 JOIN auth.users account ON account.id=recipient.id
 LEFT JOIN public.user_profiles profile ON profile.user_id=recipient.id
 WHERE recipient.id IS NOT NULL;
 IF v_recipients IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_author) THEN RETURN; END IF;
 INSERT INTO public.app_messages(
   id,title,body,status,author_id,author_alias,recipients,sent_at,
   sender_kind,source_group_id,sender_label,recipient_selection
 ) VALUES(
   v_id,left(p_title,120),left(p_body,4000),'sent',p_author,'Omiki Golf',v_recipients,clock_timestamp(),
   'app',p_group,'Omiki Golf',v_recipients
 );
 INSERT INTO public.app_message_deliveries(message_id,kind,recipient_id,recipient_label)
 SELECT v_id,'user',(value->>'id')::uuid,value->>'label'
 FROM jsonb_array_elements(v_recipients) value;
EXCEPTION WHEN OTHERS THEN
 -- Una notificación nunca debe impedir que el usuario salga o sea retirado.
 RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.notify_group_membership_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_group_name text;
 v_actor_name text;
 v_member_name text;
 v_managers uuid[];
 v_owner uuid;
BEGIN
 IF current_setting('app.account_deletion',true)='on' OR auth.uid() IS NULL THEN RETURN OLD; END IF;
 SELECT coalesce(nullif(name,''),group_code,'el grupo'),user_auth_id
 INTO v_group_name,v_owner
 FROM public.groups WHERE id=OLD.group_id;
 IF v_group_name IS NULL THEN RETURN OLD; END IF;
 SELECT coalesce(nullif(nick,''),'Jugador') INTO v_actor_name FROM public.user_profiles WHERE user_id=auth.uid();
 SELECT coalesce(nullif(nick,''),'Jugador') INTO v_member_name FROM public.user_profiles WHERE user_id=OLD.user_id;
 v_actor_name:=coalesce(v_actor_name,'Jugador');
 v_member_name:=coalesce(v_member_name,'Jugador');

 IF auth.uid()=OLD.user_id THEN
  BEGIN
   PERFORM public.notify_group_membership_accounts(
    auth.uid(),OLD.group_id,'Has abandonado un grupo','Has abandonado el grupo '||v_group_name||'.',ARRAY[OLD.user_id]
   );
   SELECT array_agg(DISTINCT manager_id) INTO v_managers FROM (
    SELECT g.user_auth_id AS manager_id FROM public.groups g WHERE g.id=OLD.group_id
    UNION ALL
    SELECT member.user_id FROM public.group_members member
    WHERE member.group_id=OLD.group_id AND member.role='admin' AND member.user_id<>OLD.user_id
   ) managers WHERE manager_id IS NOT NULL AND manager_id<>OLD.user_id;
   PERFORM public.notify_group_membership_accounts(
    auth.uid(),OLD.group_id,'Un jugador ha abandonado el grupo',v_member_name||' ha abandonado el grupo '||v_group_name||'.',v_managers
   );
  EXCEPTION WHEN OTHERS THEN NULL; END;
 ELSE
  BEGIN
   PERFORM public.notify_group_membership_accounts(
    auth.uid(),OLD.group_id,'Te han sacado de un grupo',v_actor_name||' te ha sacado del grupo '||v_group_name||'.',ARRAY[OLD.user_id]
   );
  EXCEPTION WHEN OTHERS THEN NULL; END;
 END IF;
 RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS notify_group_membership_deleted ON public.group_members;
CREATE TRIGGER notify_group_membership_deleted
AFTER DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.notify_group_membership_deleted();

CREATE OR REPLACE FUNCTION public.leave_group_membership(p_group uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_member public.group_members; v_owner uuid;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
  RAISE EXCEPTION 'No tienes permiso para abandonar el grupo' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(20260910,1900);
 SELECT user_auth_id INTO v_owner FROM public.groups WHERE id=p_group FOR UPDATE;
 SELECT * INTO v_member FROM public.group_members
 WHERE group_id=p_group AND user_id=auth.uid() FOR UPDATE;
 IF v_owner IS NULL OR v_member.id IS NULL THEN RAISE EXCEPTION 'Ya no perteneces a este grupo'; END IF;
 IF v_owner=auth.uid() THEN RAISE EXCEPTION 'El creador no puede abandonar su propio grupo'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.round_players participation
  JOIN public.golf_rounds round ON round.id=participation.round_id
  JOIN public.players player ON player.id=participation.player_id
  WHERE round.group_id=p_group AND round.status='active' AND player.auth_user_id=auth.uid()
 ) THEN
  RAISE EXCEPTION 'Tienes una partida activa en este grupo. Termínala antes de abandonarlo.';
 END IF;

 PERFORM set_config('app.group_self_leave','on',true);
 INSERT INTO public.group_write_permits(tx,entity,operation)
 VALUES(txid_current(),v_member.id,'membership') ON CONFLICT DO NOTHING;
 DELETE FROM public.group_members WHERE id=v_member.id;
 -- Borra la aceptación anterior para permitir una futura invitación explícita.
 DELETE FROM public.group_invitations WHERE group_id=p_group AND invited_user_id=auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.notify_group_membership_accounts(uuid,uuid,text,text,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.notify_group_membership_deleted() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.leave_group_membership(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.leave_group_membership(uuid) TO authenticated;

COMMIT;
