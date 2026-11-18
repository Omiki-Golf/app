-- Reglas de grupos:
-- - Team/Premium: grupo incluido + hasta 2 Grupos Adicionales (3 grupos del plan como máximo).
-- - Aparte, un Weekend de 7 días y otro de 3 meses a la vez, cada uno con su propio grupo.
-- - Un grupo Weekend de 3 meses puede pasar a Team si hay hueco: gratis si aún no existe el
--   grupo incluido o queda un adicional sin usar; si no, ocupando un Grupo Adicional nuevo.
-- - Pro-Shop: títulos y ampliaciones se contratan para cada grupo (Weekend incluido) y lo
--   pagado no se retira. Grupo Adicional es de la cuenta y se compra de uno en uno (máx. 2).
BEGIN;

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS weekend7_until timestamptz,
  ADD COLUMN IF NOT EXISTS weekend90_until timestamptz;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS weekend_days smallint;

-- Duración de los grupos Weekend existentes: más de 8 días entre creación y fin = 3 meses.
UPDATE public.groups
SET weekend_days=CASE WHEN weekend_mode_until-created_at>interval '8 days' THEN 90 ELSE 7 END
WHERE group_type='weekend' AND weekend_days IS NULL;
-- Duración de los Weekend contratados: misma regla, tomando la activación o lo que queda.
UPDATE public.user_subscriptions
SET weekend90_until=CASE WHEN weekend_mode_until-updated_at>interval '8 days'
      OR weekend_mode_until-clock_timestamp()>interval '8 days' THEN weekend_mode_until END,
    weekend7_until=CASE WHEN weekend_mode_until-updated_at>interval '8 days'
      OR weekend_mode_until-clock_timestamp()>interval '8 days' THEN NULL ELSE weekend_mode_until END
WHERE weekend_mode_until IS NOT NULL AND weekend7_until IS NULL AND weekend90_until IS NULL;

ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_weekend_days_check;
ALTER TABLE public.groups ADD CONSTRAINT groups_weekend_days_check CHECK (
  (group_type='weekend' AND weekend_days IN (7,90)) OR (group_type IS DISTINCT FROM 'weekend' AND weekend_days IS NULL)
);

CREATE OR REPLACE FUNCTION public.activate_weekend_for_testing(p_days integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_until timestamptz;
  v_current timestamptz;
  v_group text;
  v_group_until timestamptz;
  v_label text := CASE WHEN p_days=90 THEN 'de 3 meses' ELSE 'de 7 días' END;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar Weekend' USING ERRCODE='42501';
  END IF;
  IF p_days NOT IN (7,90) THEN RAISE EXCEPTION 'Duración Weekend no válida'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_subscriptions s
    WHERE s.user_id=auth.uid() AND s.status='active'
      AND s.plan_type IN ('player','team','premium')
      AND (s.current_period_end IS NULL OR s.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Para activar Omiki Weekend necesitas estar suscrito a un plan Omiki: Player o Team.' USING ERRCODE='42501';
  END IF;

  -- Se puede tener uno de 7 días y otro de 3 meses, pero no dos de la misma duración.
  SELECT coalesce(g.name,g.group_code),g.weekend_mode_until INTO v_group,v_group_until
  FROM public.groups g
  WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL AND g.group_type='weekend'
    AND g.weekend_days=p_days AND g.weekend_mode_until>clock_timestamp()
  ORDER BY g.weekend_mode_until DESC LIMIT 1;
  IF v_group_until IS NOT NULL THEN
    RAISE EXCEPTION 'Ya tienes un grupo Weekend % activo: %. Podrás contratar otro cuando venza, el % a las 23:59 h.',
      v_label, v_group, to_char(v_group_until AT TIME ZONE 'Europe/Madrid','DD/MM/YYYY') USING ERRCODE='23505';
  END IF;
  SELECT CASE WHEN p_days=90 THEN s.weekend90_until ELSE s.weekend7_until END INTO v_current
  FROM public.user_subscriptions s WHERE s.user_id=auth.uid();
  IF v_current>clock_timestamp() THEN
    RAISE EXCEPTION 'Ya tienes un Weekend % activo hasta el % a las 23:59 h. Crea su grupo desde Inicio.',
      v_label, to_char(v_current AT TIME ZONE 'Europe/Madrid','DD/MM/YYYY') USING ERRCODE='23505';
  END IF;

  v_until := public.weekend_end_of_day(clock_timestamp() + make_interval(days => p_days));
  UPDATE public.user_subscriptions SET
    weekend7_until=CASE WHEN p_days=7 THEN v_until ELSE weekend7_until END,
    weekend90_until=CASE WHEN p_days=90 THEN v_until ELSE weekend90_until END,
    updated_at=clock_timestamp()
  WHERE user_id=auth.uid();
  -- Compatibilidad: weekend_mode_until es el Weekend vigente que vence más tarde.
  UPDATE public.user_subscriptions SET weekend_mode_until=greatest(
    CASE WHEN weekend7_until>clock_timestamp() THEN weekend7_until END,
    CASE WHEN weekend90_until>clock_timestamp() THEN weekend90_until END
  ) WHERE user_id=auth.uid();
  RETURN v_until;
END $$;

CREATE OR REPLACE FUNCTION public.guard_one_active_owned_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_capacity integer := 1;
  v_weekend_until timestamptz;
  v_weekend7 timestamptz;
  v_weekend90 timestamptz;
  v_plan text;
  v_status text;
  v_period_end timestamptz;
  v_trial_end timestamptz;
  v_paid_team boolean := false;
  v_effective_team boolean := false;
BEGIN
  IF NEW.user_auth_id IS NULL OR NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT plan_type,status,current_period_end,team_trial_ends_at,weekend7_until,weekend90_until
  INTO v_plan,v_status,v_period_end,v_trial_end,v_weekend7,v_weekend90
  FROM public.user_subscriptions WHERE user_id=NEW.user_auth_id;

  IF NEW.group_type='weekend' THEN
    NEW.premium_branding:=false;
    IF TG_OP='INSERT' OR OLD.group_type IS DISTINCT FROM 'weekend' THEN
      IF NEW.weekend_days IS NULL THEN NEW.weekend_days:=7; END IF;
      v_weekend_until:=CASE WHEN NEW.weekend_days=90 THEN v_weekend90 ELSE v_weekend7 END;
      IF v_weekend_until IS NULL OR v_weekend_until<=clock_timestamp() THEN
        RAISE EXCEPTION 'Necesitas un Weekend activo para crear este grupo.';
      END IF;
      -- Cada Weekend da un solo grupo, aunque se haya archivado antes de vencer.
      IF EXISTS(
        SELECT 1 FROM public.groups g
        WHERE g.user_auth_id=NEW.user_auth_id AND g.id<>NEW.id AND g.group_type='weekend'
          AND g.weekend_days=NEW.weekend_days AND g.weekend_mode_until=v_weekend_until
      ) THEN RAISE EXCEPTION 'Este Weekend ya tiene su grupo.'; END IF;
      NEW.weekend_mode_until:=v_weekend_until;
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.groups g
      WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id
        AND g.group_type='weekend' AND g.weekend_days=NEW.weekend_days
        AND g.weekend_mode_until>clock_timestamp()
    ) THEN RAISE EXCEPTION 'Ya tienes un grupo Weekend activo de esa duración.'; END IF;
    RETURN NEW;
  END IF;

  v_paid_team := v_status='active'
    AND v_plan IN ('team','premium')
    AND (v_period_end IS NULL OR v_period_end>clock_timestamp());
  v_effective_team := v_paid_team OR (
    v_status='active' AND v_plan='player' AND v_trial_end>clock_timestamp()
  );
  IF NOT v_effective_team THEN
    RAISE EXCEPTION 'Necesitas un plan Team o Premium para crear un grupo.' USING ERRCODE='42501';
  END IF;

  IF TG_OP='INSERT' THEN
    -- El primer hueco de Premium es rosa. Cualquier hueco comprado después es Team verde.
    NEW.premium_branding := v_paid_team AND v_plan='premium' AND NOT EXISTS(
      SELECT 1 FROM public.groups g
      WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL
        AND g.group_type IS DISTINCT FROM 'weekend' AND g.premium_branding
    );
  END IF;

  IF v_paid_team THEN
    SELECT least(3, 1 + count(*)) INTO v_capacity
    FROM public.pro_shop_purchases purchase
    JOIN public.groups owned ON owned.id=purchase.group_id
    WHERE owned.user_auth_id=NEW.user_auth_id
      AND owned.group_type IS DISTINCT FROM 'weekend'
      AND purchase.product_type='grupo-adicional' AND purchase.status='completed';
  END IF;
  IF (
    SELECT count(*) FROM public.groups g
    WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id
      AND g.group_type IS DISTINCT FROM 'weekend'
  )>=v_capacity THEN
    RAISE EXCEPTION 'Tu plan no dispone de más grupos activos.' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;

-- Grupos Adicionales de la cuenta: se compran de uno en uno, hasta 2 (grupo incluido + 2 = 3).
-- Lo pagado no se retira. La fila se ancla al grupo Team/Premium principal porque la tabla exige group_id.
CREATE OR REPLACE FUNCTION public.add_additional_group_for_testing()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_anchor uuid; v_count integer;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar ampliaciones' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.user_subscriptions subscription
    WHERE subscription.user_id=auth.uid() AND subscription.status='active'
      AND subscription.plan_type IN ('team','premium')
      AND (subscription.current_period_end IS NULL OR subscription.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Necesitas Team o Premium para crear un grupo adicional.' USING ERRCODE='42501';
  END IF;
  SELECT g.id INTO v_anchor FROM public.groups g
  WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL
    AND g.group_type IS DISTINCT FROM 'weekend'
  ORDER BY g.premium_branding DESC,g.created_at,g.id LIMIT 1 FOR UPDATE;
  IF v_anchor IS NULL THEN RAISE EXCEPTION 'Crea primero tu Team o Premium.'; END IF;

  SELECT count(*) INTO v_count
  FROM public.pro_shop_purchases purchase
  JOIN public.groups owned ON owned.id=purchase.group_id
  WHERE owned.user_auth_id=auth.uid() AND owned.group_type IS DISTINCT FROM 'weekend'
    AND purchase.product_type='grupo-adicional' AND purchase.status='completed';
  IF v_count>=2 THEN
    RAISE EXCEPTION 'Ya tienes tus 2 Grupos Adicionales: tu plan admite 3 grupos.' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
  VALUES(v_anchor,auth.uid(),'grupo-adicional',0,'test','completed');
  RETURN v_count+1;
END $$;

DROP FUNCTION IF EXISTS public.set_additional_group_for_testing(boolean);
DROP FUNCTION IF EXISTS public.set_additional_groups_for_testing(integer);
DROP FUNCTION IF EXISTS public.activate_account_gamification(text[]);

-- Pasa un grupo Weekend de 3 meses a Team, conservando jugadores, partidas e historial.
CREATE OR REPLACE FUNCTION public.convert_weekend_group_to_team(p_group uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_group public.groups%ROWTYPE;
  v_groups integer;
  v_capacity integer;
  v_anchor uuid;
  v_result text := 'free';
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar este grupo' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_group FROM public.groups WHERE id=p_group FOR UPDATE;
  IF v_group.id IS NULL OR v_group.user_auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo el creador puede pasar este grupo a Team' USING ERRCODE='42501';
  END IF;
  IF v_group.group_type IS DISTINCT FROM 'weekend' OR v_group.weekend_days IS DISTINCT FROM 90
    OR v_group.archived_at IS NOT NULL OR v_group.weekend_mode_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'Solo un grupo Weekend de 3 meses activo puede pasar a Team.';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.user_subscriptions s
    WHERE s.user_id=auth.uid() AND s.status='active' AND s.plan_type IN ('team','premium')
      AND (s.current_period_end IS NULL OR s.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Necesitas un plan Team para pasar este grupo a Team.' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(20261021,140000);
  SELECT count(*) INTO v_groups FROM public.groups g
  WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL AND g.group_type IS DISTINCT FROM 'weekend';
  SELECT least(3, 1 + count(*)) INTO v_capacity
  FROM public.pro_shop_purchases purchase
  JOIN public.groups owned ON owned.id=purchase.group_id
  WHERE owned.user_auth_id=auth.uid() AND owned.group_type IS DISTINCT FROM 'weekend'
    AND purchase.product_type='grupo-adicional' AND purchase.status='completed';
  IF v_groups>=3 THEN
    RAISE EXCEPTION 'Ya tienes tus 3 grupos Team: no puedes pasar este Weekend a Team.' USING ERRCODE='23505';
  END IF;
  IF v_groups>=v_capacity THEN
    -- Sin hueco libre: se contrata un Grupo Adicional (pago de prueba, como el Pro-Shop).
    SELECT g.id INTO v_anchor FROM public.groups g
    WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL AND g.group_type IS DISTINCT FROM 'weekend'
    ORDER BY g.premium_branding DESC,g.created_at,g.id LIMIT 1;
    INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
    VALUES(v_anchor,auth.uid(),'grupo-adicional',0,'test','completed');
    v_result := 'additional';
  END IF;

  UPDATE public.groups SET group_type='team',weekend_mode_until=NULL,weekend_days=NULL,premium_branding=false
  WHERE id=p_group;

  -- Conserva los títulos y ampliaciones que compró como Weekend: es el mismo grupo.
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.add_additional_group_for_testing() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.convert_weekend_group_to_team(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.activate_weekend_for_testing(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_additional_group_for_testing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_weekend_group_to_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_weekend_for_testing(integer) TO authenticated;

-- Títulos de gamificación del grupo (Team, Premium o Weekend): solo se añaden; lo pagado no se retira.
CREATE OR REPLACE FUNCTION public.activate_group_gamification(p_group uuid,p_product_ids text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  invalid_product text;
  selected text[] := coalesce(p_product_ids,'{}'::text[]);
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() OR NOT EXISTS(
    SELECT 1 FROM public.groups g WHERE g.id=p_group AND g.user_auth_id=auth.uid() AND g.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el creador puede activar la gamificación contratada en este grupo' USING ERRCODE='42501';
  END IF;
  SELECT product_id INTO invalid_product FROM unnest(selected) product_id
  WHERE product_id NOT IN ('spanish-hand','buceador','minero','lumberjack','maestro-obstaculos','fenomeno-tee','abrelatas','hada-patos')
  LIMIT 1;
  IF invalid_product IS NOT NULL THEN
    RAISE EXCEPTION 'Producto de gamificación no válido: %',invalid_product USING ERRCODE='22023';
  END IF;
  INSERT INTO public.group_gamification AS gg(group_id,product_id,purchased,enabled,updated_by,updated_at)
  SELECT DISTINCT p_group,product_id,true,true,auth.uid(),now() FROM unnest(selected) product_id
  ON CONFLICT(group_id,product_id) DO UPDATE SET
    purchased=true,
    enabled=CASE WHEN gg.purchased THEN gg.enabled ELSE true END,
    updated_by=auth.uid(),
    updated_at=now()
  WHERE NOT gg.purchased;
END $$;

-- Ampliaciones del grupo (Team, Premium o Weekend): solo se añaden; lo pagado no se retira.
CREATE OR REPLACE FUNCTION public.activate_group_addons_for_testing(p_group uuid,p_product_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_owner uuid;
  v_allowed constant text[] := ARRAY['ampliacion-plantilla','temporada-simultanea'];
  v_roster boolean;
  v_season boolean;
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

  INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
  SELECT DISTINCT p_group,auth.uid(),product,0,'test','completed'
  FROM unnest(coalesce(p_product_ids,ARRAY[]::text[])) product
  WHERE NOT EXISTS(
    SELECT 1 FROM public.pro_shop_purchases existing
    WHERE existing.group_id=p_group AND existing.product_type=product AND existing.status='completed'
  );

  SELECT bool_or(product_type='ampliacion-plantilla'),bool_or(product_type='temporada-simultanea')
  INTO v_roster,v_season
  FROM public.pro_shop_purchases WHERE group_id=p_group AND status='completed';
  UPDATE public.groups SET
    max_players=CASE WHEN coalesce(v_roster,false) THEN 32 ELSE 20 END,
    simultaneous_season_enabled=coalesce(v_season,false)
  WHERE id=p_group;
  RETURN jsonb_build_object(
    'max_players',CASE WHEN coalesce(v_roster,false) THEN 32 ELSE 20 END,
    'simultaneous_season',coalesce(v_season,false)
  );
END $$;

-- Cada grupo nuevo empieza solo con «No paso de rojas»; los títulos de pago se compran para cada grupo.
CREATE OR REPLACE FUNCTION public.seed_group_gamification_defaults() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.group_gamification(group_id,product_id,purchased,enabled)
  VALUES(NEW.id,'no-paso-rojas',true,coalesce(NEW.hoyo_19_enabled,false))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.activate_group_gamification(uuid,text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.activate_group_addons_for_testing(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_group_gamification(uuid,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_group_addons_for_testing(uuid,text[]) TO authenticated;

COMMIT;
