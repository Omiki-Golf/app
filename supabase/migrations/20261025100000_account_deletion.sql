-- Baja de cuenta inmediata con anonimización.
--
-- Al darse de baja se borran la cuenta y los datos personales, pero los resultados se
-- quedan en los grupos para no falsear clasificaciones ni estadísticas: las fichas pasan
-- a "sin cuenta" y su nombre se marca con * en todo el historial (Fede*). El nick queda
-- reservado 6 meses. Si era creador de un grupo, su administrador pasa a ser el creador;
-- si no hay administrador, el grupo queda sin creador. Los miembros reciben un aviso.
--
-- Las protecciones del historial impiden, con razón, desvincular fichas, retirar miembros
-- sin confirmación o tocar grupos archivados. Igual que app.nick_rename en el cambio de
-- nick, la marca de transacción app.account_deletion solo la activa delete_account_data(),
-- que únicamente puede ejecutar el servidor (service_role).

BEGIN;

-- Nicks reservados tras una baja.
CREATE TABLE public.reserved_nicks (
  nick_normalized text PRIMARY KEY,
  reserved_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reserved_nicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reserved_nicks FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_nick_reserved(candidate text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.reserved_nicks WHERE nick_normalized = lower(trim(candidate)) AND reserved_until > now());
$$;
REVOKE ALL ON FUNCTION public.is_nick_reserved(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_nick_available(candidate text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT length(trim(candidate)) >= 2
    AND NOT EXISTS (
      SELECT 1 FROM user_profiles p WHERE lower(p.nick) = lower(trim(candidate))
    )
    AND NOT public.is_nick_reserved(candidate);
$function$;

CREATE OR REPLACE FUNCTION public.guard_reserved_nick() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR lower(trim(NEW.nick)) IS DISTINCT FROM lower(trim(OLD.nick)))
     AND public.is_nick_reserved(NEW.nick) THEN
    RAISE EXCEPTION 'Ese nick no está disponible' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_reserved_nick ON public.user_profiles;
CREATE TRIGGER guard_reserved_nick BEFORE INSERT OR UPDATE OF nick ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_nick();

-- La compra del grupo se conserva aunque se borre la cuenta que la hizo.
ALTER TABLE public.pro_shop_purchases ALTER COLUMN purchased_by DROP NOT NULL;
ALTER TABLE public.pro_shop_purchases DROP CONSTRAINT IF EXISTS pro_shop_purchases_purchased_by_fkey;
ALTER TABLE public.pro_shop_purchases ADD CONSTRAINT pro_shop_purchases_purchased_by_fkey
  FOREIGN KEY (purchased_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Protecciones: respetan la marca app.account_deletion (solo dentro de delete_account_data).
CREATE OR REPLACE FUNCTION public.guard_archived_group_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE target_group uuid;
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 target_group:=CASE WHEN TG_OP='DELETE' THEN OLD.group_id ELSE NEW.group_id END;
 IF target_group IS NOT NULL AND EXISTS(SELECT 1 FROM public.groups WHERE id=target_group AND archived_at IS NOT NULL) THEN
  RAISE EXCEPTION 'El grupo está archivado y solo se puede consultar' USING ERRCODE='42501';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_group_membership_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_owner uuid;
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 PERFORM pg_advisory_xact_lock(20260910,1900);
 SELECT user_auth_id INTO v_owner FROM public.groups WHERE id=coalesce(NEW.group_id,OLD.group_id);
 IF TG_OP='INSERT' THEN
  DELETE FROM public.group_write_permits WHERE tx=txid_current() AND entity=NEW.user_id AND operation='join:'||NEW.group_id::text;
  IF NOT FOUND AND NOT (NEW.user_id=v_owner AND NEW.user_id=auth.uid()) THEN RAISE EXCEPTION 'Debes aceptar una invitación vigente' USING ERRCODE='42501'; END IF;
  PERFORM public.ensure_group_player(NEW.group_id,NEW.user_id);
 ELSIF TG_OP='DELETE' THEN
  DELETE FROM public.group_write_permits WHERE tx=txid_current() AND entity=OLD.id AND operation='membership';
  IF NOT FOUND THEN RAISE EXCEPTION 'Utiliza la retirada de miembros con confirmación' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM public.require_group_manager(OLD.group_id);
  IF (NEW.id,NEW.group_id,NEW.user_id) IS DISTINCT FROM (OLD.id,OLD.group_id,OLD.user_id) THEN RAISE EXCEPTION 'Identidad inmutable'; END IF;
  IF NEW.role<>'admin' AND (OLD.user_id=v_owner OR NOT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=OLD.group_id AND user_id<>OLD.user_id AND role='admin')) THEN RAISE EXCEPTION 'El grupo necesita un administrador'; END IF;
  NEW.member_revision:=nextval('public.group_member_versions');
 END IF;
 IF public.is_app_user_read_only() THEN RAISE EXCEPTION 'Cuenta en solo lectura' USING ERRCODE='42501'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_guest_participation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.players; r public.golf_rounds; v_slope numeric;
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.is_guest THEN
   SELECT * INTO r FROM public.golf_rounds WHERE id=OLD.round_id;
   -- Cascading deletion may already have removed the parent; the reusable
   -- record still identifies the group whose writer must authorize removal.
   IF r.group_id IS NULL THEN SELECT group_id INTO r.group_id FROM public.players WHERE id=OLD.player_id; END IF;
   PERFORM public.require_group_result_writer(r.group_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' THEN
   IF (NEW.is_guest,NEW.round_id,NEW.player_id,NEW.user_id) IS DISTINCT FROM (OLD.is_guest,OLD.round_id,OLD.player_id,OLD.user_id) THEN
     RAISE EXCEPTION 'La condición y la identidad de la participación son inmutables';
   END IF;
   RETURN NEW;
 END IF;
 SELECT * INTO r FROM public.golf_rounds WHERE id=NEW.round_id FOR UPDATE;
 IF r.group_id IS NULL THEN NEW.is_guest:=false; RETURN NEW; END IF;
 SELECT * INTO p FROM public.players WHERE id=NEW.player_id FOR SHARE;
 IF p.id IS NULL OR p.group_id IS DISTINCT FROM r.group_id THEN RAISE EXCEPTION 'El jugador no pertenece a este grupo'; END IF;
 IF p.is_guest THEN
   PERFORM public.require_group_result_writer(r.group_id);
   IF r.status<>'active' THEN RAISE EXCEPTION 'La partida no está disponible en este grupo'; END IF;
   IF EXISTS(SELECT 1 FROM public.round_players WHERE round_id=r.id AND player_id=p.id) THEN RAISE EXCEPTION 'El jugador ya está en la partida'; END IF;
   IF EXISTS(SELECT 1 FROM public.round_players rp JOIN public.golf_rounds gr ON gr.id=rp.round_id WHERE rp.player_id=p.id AND gr.status='active' AND gr.id<>r.id AND gr.group_id=r.group_id) THEN
     RAISE EXCEPTION 'El jugador está en otra partida activa';
   END IF;
   IF (SELECT count(*) FROM public.round_players WHERE round_id=r.id)>=(CASE r.game_mode WHEN 'match' THEN 2 WHEN 'sindicato' THEN 3 ELSE 4 END) THEN
     RAISE EXCEPTION 'La modalidad no admite más jugadores';
   END IF;
 END IF;
 NEW.is_guest:=p.is_guest;
 IF p.auth_user_id IS NULL THEN
   SELECT CASE WHEN r.num_holes=18 THEN t.slope_18 WHEN r.holes_range='10-18' THEN t.slope_9_ii ELSE t.slope_9_i END INTO v_slope FROM public.tees t WHERE t.id=r.tee_id;
   v_slope:=CASE WHEN r.use_slope THEN coalesce(r.manual_slope,v_slope,113) ELSE 113 END;
   NEW.name:=p.name;
   NEW.user_id:=NULL;
   NEW.exact_handicap:=p.exact_handicap; NEW.exact_handicap_18:=p.exact_handicap;
   NEW.playing_handicap:=round(p.exact_handicap*(CASE WHEN r.num_holes=18 THEN 2 ELSE 1 END)*v_slope/113);
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_guest_player()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_OP='DELETE' THEN
   IF OLD.is_guest AND OLD.group_id IS NOT NULL THEN PERFORM public.require_group_manager(OLD.group_id); END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.is_guest OR NEW.is_guest) AND coalesce(OLD.group_id,NEW.group_id) IS NOT NULL THEN
   PERFORM public.require_group_result_writer(coalesce(OLD.group_id,NEW.group_id));
   IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'La identidad de la ficha es inmutable'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.is_guest,NEW.group_id) IS DISTINCT FROM (OLD.is_guest,OLD.group_id)
    AND (NEW.group_id IS NOT NULL OR OLD.group_id IS NOT NULL) THEN
   IF OLD.group_id IS NOT NULL THEN PERFORM public.require_group_manager(OLD.group_id); END IF;
   IF NEW.group_id IS NOT NULL AND NEW.group_id IS DISTINCT FROM OLD.group_id THEN PERFORM public.require_group_manager(NEW.group_id); END IF;
 ELSIF TG_OP='INSERT' AND NEW.group_id IS NOT NULL AND NEW.auth_user_id IS NULL THEN
   PERFORM public.require_group_result_writer(NEW.group_id);
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_linked_group_player()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN
  IF TG_OP='UPDATE' THEN NEW.member_revision:=OLD.member_revision+1; NEW.updated_at:=clock_timestamp(); END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF TG_OP='UPDATE' AND OLD.auth_user_id=auth.uid()
    AND current_setting('app.nick_rename',true)='on'
    AND (NEW.id,NEW.group_id,NEW.auth_user_id)=(OLD.id,OLD.group_id,OLD.auth_user_id) THEN
  NEW.member_revision:=OLD.member_revision+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
 END IF;
 IF (TG_OP='INSERT' AND NEW.auth_user_id IS NULL) OR
    (TG_OP='DELETE' AND OLD.auth_user_id IS NULL) OR
    (TG_OP='UPDATE' AND OLD.auth_user_id IS NULL AND NEW.auth_user_id IS NULL) THEN
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retira la membresía; la ficha y sus resultados se conservan' USING ERRCODE='42501'; END IF;
 DELETE FROM public.group_write_permits WHERE tx=txid_current() AND entity=NEW.id AND operation='player';
 IF NOT FOUND OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'La ficha vinculada requiere una operación autorizada' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.group_id,NEW.auth_user_id,NEW.name) IS DISTINCT FROM (OLD.id,OLD.group_id,OLD.auth_user_id,OLD.name) THEN RAISE EXCEPTION 'La identidad de la ficha es inmutable'; END IF;
  NEW.member_revision:=OLD.member_revision+1;
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_linked_handicap_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF EXISTS(SELECT 1 FROM public.players WHERE id=coalesce(NEW.player_id,OLD.player_id) AND auth_user_id IS NOT NULL)
 OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.players WHERE id=OLD.player_id AND auth_user_id IS NOT NULL)) THEN
  IF NOT EXISTS(SELECT 1 FROM public.group_write_permits WHERE tx=txid_current() AND entity=coalesce(NEW.player_id,OLD.player_id) AND operation='ledger') THEN
   RAISE EXCEPTION 'El historial de ajustes requiere una operación autorizada' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_withdrawn_round_data()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE withdrawn timestamptz;
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF TG_OP<>'INSERT' THEN
  SELECT admin_withdrawn_at INTO withdrawn FROM public.golf_rounds WHERE id=OLD.round_id FOR UPDATE;
  IF withdrawn IS NOT NULL THEN RAISE EXCEPTION 'Partida retirada por administración' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT admin_withdrawn_at INTO withdrawn FROM public.golf_rounds WHERE id=NEW.round_id FOR UPDATE;
  IF withdrawn IS NOT NULL THEN RAISE EXCEPTION 'Partida retirada por administración' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_round_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  actor_is_admin boolean := EXISTS (
    SELECT 1
    FROM public.app_administrators administrator
    WHERE administrator.user_id = auth.uid()
      AND administrator.status = 'active'
  );
BEGIN
  IF current_setting('app.account_deletion',true)='on' THEN RETURN NEW; END IF;
  IF NOT actor_is_admin THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.admin_withdrawn_at IS NOT NULL OR NEW.admin_previous_status IS NOT NULL THEN
        RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.admin_withdrawn_at IS DISTINCT FROM OLD.admin_withdrawn_at
         OR NEW.admin_previous_status IS DISTINCT FROM OLD.admin_previous_status
         OR OLD.admin_withdrawn_at IS NOT NULL THEN
        RAISE EXCEPTION 'Partida retirada por administración' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_registered_round_player()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.players; r public.golf_rounds; v_slope numeric;
BEGIN
 IF current_setting('app.account_deletion',true)='on' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.player_id,NEW.round_id,NEW.user_id) IS DISTINCT FROM (OLD.player_id,OLD.round_id,OLD.user_id)
   AND (EXISTS(SELECT 1 FROM public.players WHERE id IN (OLD.player_id,NEW.player_id) AND auth_user_id IS NOT NULL)) THEN
   RAISE EXCEPTION 'La identidad de la participación es inmutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(20260910,1900);
 SELECT * INTO p FROM public.players WHERE id=NEW.player_id FOR SHARE;
 IF p.auth_user_id IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(20260910,1900);
 SELECT * INTO r FROM public.golf_rounds WHERE id=NEW.round_id FOR UPDATE;
 IF public.is_app_user_read_only() OR NOT (public.is_group_member(p.group_id) OR public.can_manage_group_messages(p.group_id)) OR r.group_id IS DISTINCT FROM p.group_id
 OR NOT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=p.group_id AND user_id=p.auth_user_id) THEN
  RAISE EXCEPTION 'El jugador no está disponible en este grupo' USING ERRCODE='42501';
 END IF;
 IF p.handicap_pending THEN RAISE EXCEPTION 'Hándicap pendiente: debe completarlo el administrador del grupo'; END IF;
 IF NEW.exact_handicap IS DISTINCT FROM p.exact_handicap THEN RAISE EXCEPTION 'El hándicap ha cambiado. Actualiza y selecciona de nuevo al jugador.' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.round_players WHERE round_id=r.id AND player_id=p.id) THEN RAISE EXCEPTION 'El jugador ya está en la partida'; END IF;
 SELECT CASE WHEN r.num_holes=18 THEN t.slope_18 WHEN r.holes_range='10-18' THEN t.slope_9_ii ELSE t.slope_9_i END INTO v_slope FROM public.tees t WHERE t.id=r.tee_id;
 v_slope:=CASE WHEN r.use_slope THEN coalesce(r.manual_slope,v_slope,113) ELSE 113 END;
 SELECT coalesce(nick,display_name,'Cuenta registrada') INTO NEW.name FROM public.user_profiles WHERE user_id=p.auth_user_id;
 NEW.name:=coalesce(NEW.name,'Cuenta registrada');
 NEW.user_id:=p.auth_user_id;
 NEW.exact_handicap:=p.exact_handicap; NEW.exact_handicap_18:=p.exact_handicap;
 NEW.playing_handicap:=round(p.exact_handicap*(CASE WHEN r.num_holes=18 THEN 2 ELSE 1 END)*v_slope/113);
 RETURN NEW;
END $function$;

-- Aviso dentro de la app de parte de Omiki Golf a una lista de cuentas.
CREATE OR REPLACE FUNCTION public.notify_account_deletion(p_author uuid, p_group uuid, p_title text, p_body text, p_recipients uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid := gen_random_uuid(); v_recipients jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('kind', 'user', 'id', r.id, 'label', coalesce(nullif(p.nick, ''), 'Jugador')) ORDER BY r.id)
  INTO v_recipients
  FROM (SELECT DISTINCT unnest(p_recipients) AS id) r
  LEFT JOIN public.user_profiles p ON p.user_id = r.id
  WHERE r.id IS NOT NULL;
  IF v_recipients IS NULL THEN RETURN; END IF;
  INSERT INTO public.app_messages(id, title, body, status, author_id, author_alias, recipients, sent_at, sender_kind, source_group_id, sender_label, recipient_selection)
  VALUES (v_id, left(p_title, 120), left(p_body, 4000), 'sent', p_author, 'Omiki Golf', v_recipients, now(), 'app', p_group, 'Omiki Golf', v_recipients);
  INSERT INTO public.app_message_deliveries(message_id, kind, recipient_id, recipient_label)
  SELECT v_id, 'user', (v->>'id')::uuid, v->>'label' FROM jsonb_array_elements(v_recipients) v;
END $$;
REVOKE ALL ON FUNCTION public.notify_account_deletion(uuid, uuid, text, text, uuid[]) FROM PUBLIC, anon, authenticated;

-- Lo que pasará con los grupos propios, para mostrarlo antes de confirmar la baja.
CREATE OR REPLACE FUNCTION public.account_deletion_preview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'is_app_admin', EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id = auth.uid()),
    'groups', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', coalesce(g.name, g.group_code),
        'archived', g.archived_at IS NOT NULL,
        'members', (SELECT count(*) FROM public.group_members m WHERE m.group_id = g.id AND m.user_id <> auth.uid()),
        'admin', (SELECT jsonb_build_object('user_id', m.user_id, 'nick', coalesce(nullif(p.nick, ''), 'Administrador'))
                  FROM public.group_members m LEFT JOIN public.user_profiles p ON p.user_id = m.user_id
                  WHERE m.group_id = g.id AND m.user_id <> auth.uid() AND m.role = 'admin'
                  ORDER BY m.joined_at LIMIT 1)
      ) ORDER BY g.created_at)
      FROM public.groups g WHERE g.user_auth_id = auth.uid()
    ), '[]'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.account_deletion_preview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_preview() TO authenticated;

-- Anonimiza la cuenta antes de borrarla. Solo el servidor (función delete-account).
CREATE OR REPLACE FUNCTION public.delete_account_data(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_nick text; v_mark text; v_players uuid[]; v_round_players uuid[];
  g record; v_admin record; v_members uuid[]; v_others uuid[];
  v_transferred int := 0; v_orphaned int := 0;
BEGIN
  IF p_user IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'Cuenta no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'Las cuentas de administración no pueden darse de baja desde la app' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(20260910, 1900);
  PERFORM set_config('app.account_deletion', 'on', true);
  PERFORM set_config('app.nick_rename', 'on', true);

  SELECT coalesce(nullif(trim(nick), ''), nullif(trim(display_name), '')) INTO v_nick FROM public.user_profiles WHERE user_id = p_user;
  v_mark := coalesce(v_nick, 'Jugador') || '*';

  -- 1. Nick reservado 6 meses.
  IF v_nick IS NOT NULL THEN
    INSERT INTO public.reserved_nicks(nick_normalized, reserved_until)
    VALUES (lower(v_nick), now() + interval '6 months')
    ON CONFLICT (nick_normalized) DO UPDATE SET reserved_until = excluded.reserved_until;
  END IF;

  -- 2. Grupos propios: el administrador pasa a creador; sin administrador, sin creador.
  FOR g IN SELECT id, coalesce(name, group_code) AS name, archived_at FROM public.groups WHERE user_auth_id = p_user LOOP
    SELECT array_agg(user_id) INTO v_members FROM public.group_members WHERE group_id = g.id AND user_id <> p_user;
    SELECT m.user_id, coalesce(nullif(p.nick, ''), 'Administrador') AS nick INTO v_admin
    FROM public.group_members m LEFT JOIN public.user_profiles p ON p.user_id = m.user_id
    WHERE m.group_id = g.id AND m.user_id <> p_user AND m.role = 'admin'
      -- Un plan incluye un grupo activo: si ya crea otro activo, no puede heredar este.
      AND (g.archived_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.groups o WHERE o.user_auth_id = m.user_id AND o.archived_at IS NULL AND o.id <> g.id))
    ORDER BY m.joined_at LIMIT 1;

    IF v_admin.user_id IS NOT NULL THEN
      UPDATE public.groups SET user_auth_id = v_admin.user_id WHERE id = g.id;
      v_transferred := v_transferred + 1;
      PERFORM public.notify_account_deletion(p_user, g.id,
        format('Ahora eres el creador de %s', g.name),
        format('%s se ha dado de baja de Omiki Golf y ahora eres el creador del grupo %s. Nombra a otro jugador como administrador desde Mis grupos → Jugadores y administradores.', coalesce(v_nick, 'El creador'), g.name),
        ARRAY[v_admin.user_id]);
      SELECT array_agg(x) INTO v_others FROM unnest(coalesce(v_members, '{}')) x WHERE x <> v_admin.user_id;
      PERFORM public.notify_account_deletion(p_user, g.id,
        format('Nuevo creador en %s', g.name),
        format('El creador %s se ha dado de baja de Omiki Golf. El nuevo creador del grupo %s es %s.', coalesce(v_nick, ''), g.name, v_admin.nick),
        v_others);
    ELSE
      UPDATE public.groups SET user_auth_id = NULL WHERE id = g.id;
      v_orphaned := v_orphaned + 1;
      PERFORM public.notify_account_deletion(p_user, g.id,
        format('%s se ha quedado sin creador', g.name),
        format('El creador %s se ha dado de baja de Omiki Golf y el grupo %s ha quedado sin creador.', coalesce(v_nick, ''), g.name),
        v_members);
    END IF;
  END LOOP;

  -- 3. Nombre marcado con * en todo el historial (igual que el cambio de nick).
  SELECT array_agg(id) INTO v_players FROM public.players WHERE auth_user_id = p_user;
  SELECT array_agg(id) INTO v_round_players FROM public.round_players WHERE user_id = p_user OR player_id = ANY(coalesce(v_players, '{}'));
  UPDATE public.players SET name = v_mark WHERE auth_user_id = p_user;
  UPDATE public.round_players SET name = v_mark WHERE id = ANY(coalesce(v_round_players, '{}'));
  UPDATE public.archived_rounds ar SET
    final_ranking = (SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_db_id' = ANY(coalesce(v_players, '{}')::text[]) OR e->>'player_id' = ANY(coalesce(v_round_players, '{}')::text[]) THEN jsonb_set(e, '{player_name}', to_jsonb(v_mark)) ELSE e END ORDER BY ord), '[]') FROM jsonb_array_elements(coalesce(ar.final_ranking, '[]')) WITH ORDINALITY x(e, ord)),
    player_stats = (SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_db_id' = ANY(coalesce(v_players, '{}')::text[]) OR e->>'player_id' = ANY(coalesce(v_round_players, '{}')::text[]) THEN jsonb_set(e, '{player_name}', to_jsonb(v_mark)) ELSE e END ORDER BY ord), '[]') FROM jsonb_array_elements(coalesce(ar.player_stats, '[]')) WITH ORDINALITY x(e, ord)),
    hole_scores = (SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_db_id' = ANY(coalesce(v_players, '{}')::text[]) OR e->>'player_id' = ANY(coalesce(v_round_players, '{}')::text[]) THEN jsonb_set(e, '{player_name}', to_jsonb(v_mark)) ELSE e END ORDER BY ord), '[]') FROM jsonb_array_elements(coalesce(ar.hole_scores, '[]')) WITH ORDINALITY x(e, ord))
  WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ar.final_ranking, '[]') || coalesce(ar.player_stats, '[]') || coalesce(ar.hole_scores, '[]')) e
               WHERE e->>'player_db_id' = ANY(coalesce(v_players, '{}')::text[]) OR e->>'player_id' = ANY(coalesce(v_round_players, '{}')::text[]));
  UPDATE public.daily_rankings SET player_name = v_mark WHERE game_player_id = ANY(coalesce(v_players, '{}'));
  UPDATE public.handicap_adjustments SET player_name = v_mark WHERE player_id = ANY(coalesce(v_players, '{}'));

  -- 4. Fichas y participaciones sin cuenta: los resultados se quedan en los grupos.
  UPDATE public.players SET auth_user_id = NULL WHERE auth_user_id = p_user;
  UPDATE public.round_players SET user_id = NULL WHERE user_id = p_user;
  -- Sin esto, borrar la cuenta borraría en cascada las partidas que creó.
  UPDATE public.golf_rounds SET created_by = NULL WHERE created_by = p_user;

  -- 5. Membresías, invitaciones, compras, suscripción y buzón.
  UPDATE public.group_members SET invited_by = NULL WHERE invited_by = p_user;
  DELETE FROM public.group_members WHERE user_id = p_user;
  DELETE FROM public.group_invitations WHERE invited_by = p_user OR invited_user_id = p_user;
  UPDATE public.pro_shop_purchases SET purchased_by = NULL WHERE purchased_by = p_user;
  DELETE FROM public.user_subscriptions WHERE user_id = p_user;
  DELETE FROM public.app_message_deliveries WHERE kind = 'user' AND recipient_id = p_user;
  DELETE FROM public.user_profiles WHERE user_id = p_user;

  PERFORM set_config('app.nick_rename', 'off', true);
  PERFORM set_config('app.account_deletion', 'off', true);
  RETURN jsonb_build_object('groups_transferred', v_transferred, 'groups_without_owner', v_orphaned);
END $$;
REVOKE ALL ON FUNCTION public.delete_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid) TO service_role;

COMMIT;
