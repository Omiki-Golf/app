BEGIN;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS simultaneous_season_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS weekend_mode_until timestamptz;

ALTER TABLE public.pro_shop_purchases DROP CONSTRAINT IF EXISTS pro_shop_purchases_product_type_check;
ALTER TABLE public.pro_shop_purchases ADD CONSTRAINT pro_shop_purchases_product_type_check
  CHECK (product_type IN (
    'extra_players','premium_branding','weekend_mode',
    'grupo-adicional','ampliacion-plantilla','temporada-simultanea'
  ));
ALTER TABLE public.pro_shop_purchases DROP CONSTRAINT IF EXISTS pro_shop_purchases_payment_method_check;
ALTER TABLE public.pro_shop_purchases ADD CONSTRAINT pro_shop_purchases_payment_method_check
  CHECK (payment_method IN ('lightning','stripe','test'));

DROP POLICY IF EXISTS pro_shop_purchases_owner_read ON public.pro_shop_purchases;
CREATE POLICY pro_shop_purchases_owner_read ON public.pro_shop_purchases FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.groups owned
  WHERE owned.id=pro_shop_purchases.group_id AND owned.user_auth_id=auth.uid()
));

CREATE OR REPLACE FUNCTION public.activate_weekend_for_testing(p_days integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_until timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar Weekend' USING ERRCODE='42501';
  END IF;
  IF p_days NOT IN (7,90) THEN RAISE EXCEPTION 'Duración Weekend no válida'; END IF;
  v_until := clock_timestamp() + make_interval(days => p_days);
  INSERT INTO public.user_subscriptions(user_id,plan_type,status,current_period_start,current_period_end,weekend_mode_until,updated_at)
  VALUES(auth.uid(),'express','active',clock_timestamp(),v_until,v_until,clock_timestamp())
  ON CONFLICT(user_id) DO UPDATE SET weekend_mode_until=v_until,updated_at=clock_timestamp();
  RETURN v_until;
END $$;

CREATE OR REPLACE FUNCTION public.activate_group_addons_for_testing(p_group uuid,p_product_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_owner uuid;
  v_allowed constant text[] := ARRAY['grupo-adicional','ampliacion-plantilla','temporada-simultanea'];
  v_active_groups integer;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar ampliaciones' USING ERRCODE='42501';
  END IF;
  SELECT user_auth_id INTO v_owner FROM public.groups WHERE id=p_group AND archived_at IS NULL FOR UPDATE;
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo el creador puede activar ampliaciones para el grupo' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(coalesce(p_product_ids,ARRAY[]::text[])) product WHERE NOT product=ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Ampliación no válida';
  END IF;
  SELECT count(*) INTO v_active_groups FROM public.groups WHERE user_auth_id=auth.uid() AND archived_at IS NULL;
  IF NOT ('grupo-adicional'=ANY(coalesce(p_product_ids,ARRAY[]::text[]))) AND v_active_groups>1 THEN
    RAISE EXCEPTION 'Archiva los grupos adicionales antes de retirar esta ampliación';
  END IF;

  DELETE FROM public.pro_shop_purchases
  WHERE group_id=p_group AND product_type=ANY(v_allowed);
  INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
  SELECT p_group,auth.uid(),product,0,'test','completed'
  FROM unnest(coalesce(p_product_ids,ARRAY[]::text[])) product;

  UPDATE public.groups SET
    max_players=CASE WHEN 'ampliacion-plantilla'=ANY(coalesce(p_product_ids,ARRAY[]::text[])) THEN 32 ELSE 20 END,
    simultaneous_season_enabled='temporada-simultanea'=ANY(coalesce(p_product_ids,ARRAY[]::text[]))
  WHERE id=p_group;

  RETURN jsonb_build_object(
    'max_players',CASE WHEN 'ampliacion-plantilla'=ANY(coalesce(p_product_ids,ARRAY[]::text[])) THEN 32 ELSE 20 END,
    'additional_group','grupo-adicional'=ANY(coalesce(p_product_ids,ARRAY[]::text[])),
    'simultaneous_season','temporada-simultanea'=ANY(coalesce(p_product_ids,ARRAY[]::text[]))
  );
END $$;

CREATE OR REPLACE FUNCTION public.guard_one_active_owned_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_capacity integer;
BEGIN
  IF NEW.user_auth_id IS NOT NULL AND NEW.archived_at IS NULL THEN
    SELECT 1 + count(*) INTO v_capacity
    FROM public.pro_shop_purchases purchase
    JOIN public.groups owned ON owned.id=purchase.group_id
    WHERE owned.user_auth_id=NEW.user_auth_id AND purchase.product_type='grupo-adicional' AND purchase.status='completed';
    IF (SELECT count(*) FROM public.groups g WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id)>=v_capacity THEN
      RAISE EXCEPTION 'Tu plan no dispone de más grupos activos.' USING ERRCODE='23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.add_group_guest_player(p_group uuid,p_name text,p_handicap_18 numeric)
RETURNS public.players LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_player public.players; v_handicap_9 numeric; v_limit integer;
BEGIN
  PERFORM pg_advisory_xact_lock(20261021,1500);
  PERFORM public.require_group_manager(p_group);
  IF nullif(trim(p_name),'') IS NULL THEN RAISE EXCEPTION 'Indica el nombre del jugador'; END IF;
  IF p_handicap_18 IS NULL OR p_handicap_18<0 OR p_handicap_18>54 OR p_handicap_18::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Indica un hándicap de 18 hoyos entre 0 y 54'; END IF;
  IF EXISTS(SELECT 1 FROM public.players WHERE group_id=p_group AND lower(name)=lower(trim(p_name))) THEN RAISE EXCEPTION 'Ya existe un jugador con ese nombre en el grupo'; END IF;
  SELECT max_players INTO v_limit FROM public.groups WHERE id=p_group FOR SHARE;
  IF (SELECT count(*) FROM public.players WHERE group_id=p_group)>=coalesce(v_limit,20) THEN RAISE EXCEPTION 'El grupo ya ha alcanzado el máximo de jugadores'; END IF;
  v_handicap_9:=round(p_handicap_18/2);
  INSERT INTO public.players(group_id,name,exact_handicap,exact_handicap_18,playing_handicap,is_guest)
  VALUES(p_group,trim(p_name),v_handicap_9,v_handicap_9,v_handicap_9,false) RETURNING * INTO v_player;
  RETURN v_player;
END $$;

CREATE OR REPLACE FUNCTION public.respond_to_group_invitation(p_invitation uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation public.group_invitations; v_limit integer;
BEGIN
  PERFORM pg_advisory_xact_lock(20260910,1900);
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'No tienes permiso para responder' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('accepted','rejected') THEN RAISE EXCEPTION 'Respuesta no válida'; END IF;
  SELECT * INTO invitation FROM public.group_invitations WHERE id=p_invitation AND invited_user_id=auth.uid() FOR UPDATE;
  IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitación no disponible' USING ERRCODE='42501'; END IF;
  IF invitation.status<>'pending' THEN IF invitation.status=p_status THEN RETURN; END IF; RAISE EXCEPTION 'La invitación ya tiene otra respuesta'; END IF;
  IF p_status='accepted' AND NOT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=invitation.group_id AND user_id=auth.uid()) THEN
    SELECT max_players INTO v_limit FROM public.groups WHERE id=invitation.group_id FOR SHARE;
    IF (SELECT count(*) FROM public.players WHERE group_id=invitation.group_id)>=coalesce(v_limit,20) THEN RAISE EXCEPTION 'El grupo ya ha alcanzado el máximo de jugadores'; END IF;
    INSERT INTO public.group_write_permits VALUES(txid_current(),auth.uid(),'join:'||invitation.group_id::text);
    INSERT INTO public.group_members(group_id,user_id,role,invited_by) VALUES(invitation.group_id,auth.uid(),'member',invitation.invited_by);
  END IF;
  INSERT INTO public.group_write_permits VALUES(txid_current(),invitation.id,'invitation');
  UPDATE public.group_invitations SET status=p_status,responded_at=now() WHERE id=invitation.id;
END $$;

REVOKE ALL ON FUNCTION public.activate_weekend_for_testing(integer),public.activate_group_addons_for_testing(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_weekend_for_testing(integer),public.activate_group_addons_for_testing(uuid,text[]) TO authenticated;

COMMIT;
