-- Omiki Weekend vence al final del día (23:59:59, hora de Madrid) y su grupo se archiva solo.
-- - Un Weekend da un único grupo: no se puede contratar otro mientras haya uno vigente.
-- - El grupo Weekend vencido deja de admitir partidas y se archiva (cron cada 5 minutos
--   y también cuando la app carga los grupos).
BEGIN;

-- Último segundo del día (hora de Madrid) en que cae el instante indicado.
CREATE OR REPLACE FUNCTION public.weekend_end_of_day(p_at timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT ((((p_at AT TIME ZONE 'Europe/Madrid')::date) + 1)::timestamp AT TIME ZONE 'Europe/Madrid') - interval '1 second';
$$;

CREATE OR REPLACE FUNCTION public.activate_weekend_for_testing(p_days integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_until timestamptz;
  v_current timestamptz;
  v_group text;
  v_group_until timestamptz;
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

  -- Un Weekend vigente (con o sin grupo creado) impide contratar otro.
  SELECT coalesce(g.name,g.group_code),g.weekend_mode_until INTO v_group,v_group_until
  FROM public.groups g
  WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL
    AND g.group_type='weekend' AND g.weekend_mode_until>clock_timestamp()
  ORDER BY g.weekend_mode_until DESC LIMIT 1;
  IF v_group_until IS NOT NULL THEN
    RAISE EXCEPTION 'Ya tienes un grupo Weekend activo: %. Podrás contratar otro Weekend cuando venza, el % a las 23:59 h.',
      v_group, to_char(v_group_until AT TIME ZONE 'Europe/Madrid','DD/MM/YYYY') USING ERRCODE='23505';
  END IF;
  SELECT s.weekend_mode_until INTO v_current FROM public.user_subscriptions s WHERE s.user_id=auth.uid();
  IF v_current>clock_timestamp() THEN
    RAISE EXCEPTION 'Ya tienes un Weekend activo hasta el % a las 23:59 h. Crea su grupo desde Inicio.',
      to_char(v_current AT TIME ZONE 'Europe/Madrid','DD/MM/YYYY') USING ERRCODE='23505';
  END IF;

  v_until := public.weekend_end_of_day(clock_timestamp() + make_interval(days => p_days));
  UPDATE public.user_subscriptions SET weekend_mode_until=v_until,updated_at=clock_timestamp() WHERE user_id=auth.uid();
  RETURN v_until;
END $$;

CREATE OR REPLACE FUNCTION public.guard_one_active_owned_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_capacity integer := 1;
  v_weekend_until timestamptz;
  v_plan text;
  v_status text;
  v_period_end timestamptz;
  v_trial_end timestamptz;
  v_paid_team boolean := false;
  v_effective_team boolean := false;
BEGIN
  IF NEW.user_auth_id IS NULL OR NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT plan_type,status,current_period_end,team_trial_ends_at,weekend_mode_until
  INTO v_plan,v_status,v_period_end,v_trial_end,v_weekend_until
  FROM public.user_subscriptions WHERE user_id=NEW.user_auth_id;

  IF NEW.group_type='weekend' THEN
    NEW.premium_branding:=false;
    IF TG_OP='INSERT' OR OLD.group_type IS DISTINCT FROM 'weekend' THEN
      IF v_weekend_until IS NULL OR v_weekend_until<=clock_timestamp() THEN
        RAISE EXCEPTION 'Necesitas un Weekend activo para crear este grupo.';
      END IF;
      -- Cada Weekend da un solo grupo, aunque se haya archivado antes de vencer.
      IF EXISTS(
        SELECT 1 FROM public.groups g
        WHERE g.user_auth_id=NEW.user_auth_id AND g.id<>NEW.id
          AND g.group_type='weekend' AND g.weekend_mode_until=v_weekend_until
      ) THEN RAISE EXCEPTION 'Este Weekend ya tiene su grupo.'; END IF;
      NEW.weekend_mode_until:=v_weekend_until;
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.groups g
      WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id
        AND g.group_type='weekend' AND g.weekend_mode_until>clock_timestamp()
    ) THEN RAISE EXCEPTION 'Ya tienes un grupo Weekend activo.'; END IF;
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
    SELECT 1 + count(*) INTO v_capacity
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

-- Un grupo Weekend vencido no admite partidas nuevas aunque el archivado aún no haya pasado.
CREATE OR REPLACE FUNCTION public.guard_archived_group_round() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.group_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.groups WHERE id=NEW.group_id AND (
   archived_at IS NOT NULL OR (group_type='weekend' AND weekend_mode_until<=clock_timestamp())
  )
 ) THEN
  RAISE EXCEPTION 'El grupo está archivado y no admite nuevas partidas' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

-- Archiva los grupos Weekend vencidos. Igual que archivar a mano: primero se cancelan
-- las invitaciones pendientes. La fecha de archivo es la de vencimiento.
CREATE OR REPLACE FUNCTION public.archive_expired_weekend_groups() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE archived integer;
BEGIN
 IF public.is_app_user_read_only() THEN RETURN 0; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.groups WHERE group_type='weekend' AND archived_at IS NULL AND weekend_mode_until<=clock_timestamp()
 ) THEN RETURN 0; END IF;
 PERFORM pg_advisory_xact_lock(20261021,140000);
 DELETE FROM public.group_invitations i USING public.groups g
 WHERE i.group_id=g.id AND i.status='pending'
   AND g.group_type='weekend' AND g.archived_at IS NULL AND g.weekend_mode_until<=clock_timestamp();
 UPDATE public.groups SET archived_at=weekend_mode_until
 WHERE group_type='weekend' AND archived_at IS NULL AND weekend_mode_until<=clock_timestamp();
 GET DIAGNOSTICS archived = ROW_COUNT;
 RETURN archived;
END $$;

REVOKE ALL ON FUNCTION public.weekend_end_of_day(timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.archive_expired_weekend_groups() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.activate_weekend_for_testing(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.weekend_end_of_day(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_expired_weekend_groups() TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_weekend_for_testing(integer) TO authenticated;

-- Los Weekend que vencen hoy o más adelante pasan a vencer al final de su día.
-- Suscripción y grupo usan la misma función, así que siguen coincidiendo.
UPDATE public.user_subscriptions
SET weekend_mode_until=public.weekend_end_of_day(weekend_mode_until)
WHERE weekend_mode_until >= (((clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date)::timestamp AT TIME ZONE 'Europe/Madrid');
UPDATE public.groups
SET weekend_mode_until=public.weekend_end_of_day(weekend_mode_until)
WHERE group_type='weekend' AND archived_at IS NULL
  AND weekend_mode_until >= (((clock_timestamp() AT TIME ZONE 'Europe/Madrid')::date)::timestamp AT TIME ZONE 'Europe/Madrid');

SELECT public.archive_expired_weekend_groups();

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('archive-expired-weekend-groups', '*/5 * * * *', 'SELECT public.archive_expired_weekend_groups()');

COMMIT;
