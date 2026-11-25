-- Códigos regalo (premios de torneos, tarjetas impresas): suscripción sin pago.
-- - 8 caracteres hexadecimales en mayúsculas, de un solo uso y con fecha límite de canje.
-- - Player o Team (1 mes o 1 año) y Weekend (7 días o 3 meses).
-- - Los crea y anula un administrador de la app; se canjean al registrarse o desde el perfil.
-- - Un código Weekend basta por sí solo: no exige tener Player o Team.
BEGIN;

CREATE TABLE IF NOT EXISTS public.gift_codes (
  code text PRIMARY KEY CHECK (code ~ '^[0-9A-F]{8}$'),
  plan text NOT NULL CHECK (plan IN ('player','team','weekend')),
  duration text NOT NULL,
  note text CHECK (note IS NULL OR length(note) <= 120),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by uuid,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT gift_codes_duration_check CHECK (
    (plan IN ('player','team') AND duration IN ('monthly','annual'))
    OR (plan = 'weekend' AND duration IN ('7d','90d'))
  )
);
CREATE INDEX IF NOT EXISTS gift_codes_recent ON public.gift_codes (created_at DESC, code);

-- Sin políticas: solo se accede con las funciones de abajo.
ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gift_codes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.normalize_gift_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT upper(regexp_replace(coalesce(p_code,''), '[^0-9A-Za-z]', '', 'g'));
$$;

-- Comprobación antes del alta (también sin sesión). Solo dice si se puede canjear y qué da.
CREATE OR REPLACE FUNCTION public.check_gift_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.gift_codes;
BEGIN
  SELECT * INTO v FROM public.gift_codes WHERE code = public.normalize_gift_code(p_code);
  IF v.code IS NULL OR v.redeemed_at IS NOT NULL OR v.revoked_at IS NOT NULL OR v.expires_at <= clock_timestamp() THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('code', v.code, 'plan', v.plan, 'duration', v.duration, 'expires_at', v.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.redeem_gift_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v public.gift_codes;
  v_user uuid := auth.uid();
  v_until timestamptz;
  v_days integer;
  v_current timestamptz;
BEGIN
  IF v_user IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'Inicia sesión con una cuenta que pueda editar para canjear el código.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v FROM public.gift_codes WHERE code = public.normalize_gift_code(p_code) FOR UPDATE;
  IF v.code IS NULL THEN RAISE EXCEPTION 'El código no existe. Revisa que esté bien escrito.' USING ERRCODE='22023'; END IF;
  IF v.redeemed_by = v_user THEN
    RETURN jsonb_build_object('code', v.code, 'plan', v.plan, 'duration', v.duration, 'already', true);
  END IF;
  IF v.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'Este código ya se ha canjeado.' USING ERRCODE='23505'; END IF;
  IF v.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Este código ya no es válido.' USING ERRCODE='22023'; END IF;
  IF v.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'Este código ha caducado.' USING ERRCODE='22023'; END IF;

  PERFORM 1 FROM public.user_subscriptions WHERE user_id = v_user FOR UPDATE;

  IF v.plan IN ('player','team') THEN
    IF EXISTS (
      SELECT 1 FROM public.user_subscriptions s
      WHERE s.user_id = v_user AND s.status = 'active' AND s.plan_type IN ('player','team','premium')
        AND (s.current_period_end IS NULL OR s.current_period_end > clock_timestamp())
    ) THEN
      RAISE EXCEPTION 'Ya tienes un plan Omiki activo. Podrás canjear este código cuando venza.' USING ERRCODE='23505';
    END IF;
    v_until := clock_timestamp() + CASE WHEN v.duration = 'annual' THEN interval '1 year' ELSE interval '1 month' END;
    INSERT INTO public.user_subscriptions(user_id, plan_type, status, payment_hash, current_period_start, current_period_end, updated_at)
    VALUES (v_user, v.plan, 'active', 'gift:' || v.code, clock_timestamp(), v_until, clock_timestamp())
    ON CONFLICT (user_id) DO UPDATE SET plan_type = excluded.plan_type, status = 'active', payment_hash = excluded.payment_hash,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end, updated_at = excluded.updated_at;
  ELSE
    v_days := CASE WHEN v.duration = '90d' THEN 90 ELSE 7 END;
    SELECT CASE WHEN v_days = 90 THEN s.weekend90_until ELSE s.weekend7_until END INTO v_current
    FROM public.user_subscriptions s WHERE s.user_id = v_user;
    IF v_current > clock_timestamp() OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.user_auth_id = v_user AND g.archived_at IS NULL AND g.group_type = 'weekend'
        AND g.weekend_days = v_days AND g.weekend_mode_until > clock_timestamp()
    ) THEN
      RAISE EXCEPTION 'Ya tienes un Weekend de esa duración activo. Podrás canjear este código cuando venza.' USING ERRCODE='23505';
    END IF;
    v_until := public.weekend_end_of_day(clock_timestamp() + make_interval(days => v_days));
    INSERT INTO public.user_subscriptions(user_id, plan_type, status, current_period_start, updated_at)
    VALUES (v_user, 'express', 'active', clock_timestamp(), clock_timestamp())
    ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.user_subscriptions SET
      weekend7_until = CASE WHEN v_days = 7 THEN v_until ELSE weekend7_until END,
      weekend90_until = CASE WHEN v_days = 90 THEN v_until ELSE weekend90_until END,
      updated_at = clock_timestamp()
    WHERE user_id = v_user;
    UPDATE public.user_subscriptions SET weekend_mode_until = greatest(
      CASE WHEN weekend7_until > clock_timestamp() THEN weekend7_until END,
      CASE WHEN weekend90_until > clock_timestamp() THEN weekend90_until END
    ) WHERE user_id = v_user;
  END IF;

  UPDATE public.gift_codes SET redeemed_by = v_user, redeemed_at = clock_timestamp() WHERE code = v.code;
  RETURN jsonb_build_object('code', v.code, 'plan', v.plan, 'duration', v.duration, 'until', v_until, 'already', false);
END $$;

CREATE OR REPLACE FUNCTION public.admin_create_gift_codes(p_plan text, p_duration text, p_count integer, p_expires_at timestamptz, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor public.app_administrators;
  v_code text;
  v_codes text[] := '{}';
  v_note text := nullif(trim(coalesce(p_note,'')), '');
BEGIN
  SELECT * INTO actor FROM public.app_administrators WHERE user_id = auth.uid() AND status = 'active';
  IF actor.user_id IS NULL THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
  IF p_count IS NULL OR p_count NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Indica entre 1 y 200 códigos.'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'La fecha límite de canje debe ser futura.'; END IF;
  IF NOT ((p_plan IN ('player','team') AND p_duration IN ('monthly','annual')) OR (p_plan = 'weekend' AND p_duration IN ('7d','90d'))) THEN
    RAISE EXCEPTION 'Plan o duración no válidos.';
  END IF;
  WHILE coalesce(array_length(v_codes, 1), 0) < p_count LOOP
    -- Los 8 primeros caracteres de un UUID v4 son aleatorios.
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    INSERT INTO public.gift_codes(code, plan, duration, note, expires_at, created_by)
    VALUES (v_code, p_plan, p_duration, v_note, p_expires_at, actor.user_id)
    ON CONFLICT (code) DO NOTHING;
    IF FOUND THEN v_codes := v_codes || v_code; END IF;
  END LOOP;
  INSERT INTO public.app_admin_audit(actor_user_id, actor_alias, action, details)
  VALUES (actor.user_id, actor.alias, 'gift_codes.created', jsonb_build_object(
    'plan', p_plan, 'duration', p_duration, 'count', p_count, 'expires_at', p_expires_at, 'note', v_note, 'codes', to_jsonb(v_codes)));
  RETURN to_jsonb(v_codes);
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_gift_codes(p_status text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_administrators WHERE user_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_data ORDER BY created_at DESC, code)
    FROM (
      SELECT c.code, c.created_at, jsonb_build_object(
        'code', c.code, 'plan', c.plan, 'duration', c.duration, 'note', c.note,
        'expires_at', c.expires_at, 'created_at', c.created_at,
        'redeemed_at', c.redeemed_at, 'redeemed_by', c.redeemed_by, 'redeemed_nick', p.nick,
        'revoked_at', c.revoked_at,
        'status', CASE
          WHEN c.redeemed_at IS NOT NULL THEN 'redeemed'
          WHEN c.revoked_at IS NOT NULL THEN 'revoked'
          WHEN c.expires_at <= clock_timestamp() THEN 'expired'
          ELSE 'available' END
      ) AS row_data
      FROM public.gift_codes c
      LEFT JOIN public.user_profiles p ON p.user_id = c.redeemed_by
    ) rows
    WHERE coalesce(p_status, '') = '' OR row_data->>'status' = p_status
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_gift_code(p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.app_administrators; v public.gift_codes;
BEGIN
  SELECT * INTO actor FROM public.app_administrators WHERE user_id = auth.uid() AND status = 'active';
  IF actor.user_id IS NULL THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.gift_codes WHERE code = public.normalize_gift_code(p_code) FOR UPDATE;
  IF v.code IS NULL THEN RAISE EXCEPTION 'El código no existe.'; END IF;
  IF v.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'Un código canjeado no se puede anular.'; END IF;
  IF v.revoked_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.gift_codes SET revoked_at = clock_timestamp() WHERE code = v.code;
  INSERT INTO public.app_admin_audit(actor_user_id, actor_alias, action, details)
  VALUES (actor.user_id, actor.alias, 'gift_code.revoked', jsonb_build_object('code', v.code, 'plan', v.plan, 'duration', v.duration));
END $$;

REVOKE ALL ON FUNCTION public.normalize_gift_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_gift_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_gift_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_gift_codes(text, text, integer, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_gift_codes(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_gift_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_gift_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_gift_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_gift_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_gift_codes(text, text, integer, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_gift_codes(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_gift_code(text) TO authenticated;

COMMIT;
