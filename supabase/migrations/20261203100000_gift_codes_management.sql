-- Gestión de códigos regalo desde el portal:
-- - Tandas: los códigos creados juntos comparten batch_id (para verlos y anularlos juntos).
-- - Anular de golpe los códigos disponibles de una tanda.
-- - Cambiar la fecha límite de canje de un código no canjeado ni anulado (también reactiva un caducado).
BEGIN;

ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS batch_id uuid;
-- Tandas ya creadas: los de una misma llamada comparten creador e instante de creación.
UPDATE public.gift_codes c SET batch_id = b.batch_id
FROM (
  SELECT created_by, created_at, gen_random_uuid() AS batch_id
  FROM public.gift_codes WHERE batch_id IS NULL GROUP BY created_by, created_at
) b
WHERE c.batch_id IS NULL AND c.created_by = b.created_by AND c.created_at = b.created_at;
CREATE INDEX IF NOT EXISTS gift_codes_batch ON public.gift_codes (batch_id);

CREATE OR REPLACE FUNCTION public.admin_create_gift_codes(p_plan text, p_duration text, p_count integer, p_expires_at timestamptz, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor public.app_administrators;
  v_code text;
  v_codes text[] := '{}';
  v_note text := nullif(trim(coalesce(p_note,'')), '');
  v_batch uuid := gen_random_uuid();
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
    INSERT INTO public.gift_codes(code, plan, duration, note, expires_at, created_by, batch_id)
    VALUES (v_code, p_plan, p_duration, v_note, p_expires_at, actor.user_id, v_batch)
    ON CONFLICT (code) DO NOTHING;
    IF FOUND THEN v_codes := v_codes || v_code; END IF;
  END LOOP;
  INSERT INTO public.app_admin_audit(actor_user_id, actor_alias, action, details)
  VALUES (actor.user_id, actor.alias, 'gift_codes.created', jsonb_build_object(
    'batch_id', v_batch, 'plan', p_plan, 'duration', p_duration, 'count', p_count, 'expires_at', p_expires_at, 'note', v_note, 'codes', to_jsonb(v_codes)));
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
        'code', c.code, 'plan', c.plan, 'duration', c.duration, 'note', c.note, 'batch_id', c.batch_id,
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

CREATE OR REPLACE FUNCTION public.admin_revoke_gift_code_batch(p_batch uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.app_administrators; v_codes text[];
BEGIN
  SELECT * INTO actor FROM public.app_administrators WHERE user_id = auth.uid() AND status = 'active';
  IF actor.user_id IS NULL THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
  WITH revoked AS (
    UPDATE public.gift_codes SET revoked_at = clock_timestamp()
    WHERE batch_id = p_batch AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > clock_timestamp()
    RETURNING code
  ) SELECT coalesce(array_agg(code ORDER BY code), '{}') INTO v_codes FROM revoked;
  IF cardinality(v_codes) > 0 THEN
    INSERT INTO public.app_admin_audit(actor_user_id, actor_alias, action, details)
    VALUES (actor.user_id, actor.alias, 'gift_codes.batch_revoked', jsonb_build_object('batch_id', p_batch, 'codes', to_jsonb(v_codes)));
  END IF;
  RETURN cardinality(v_codes);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_gift_code_expiry(p_code text, p_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.app_administrators; v public.gift_codes;
BEGIN
  SELECT * INTO actor FROM public.app_administrators WHERE user_id = auth.uid() AND status = 'active';
  IF actor.user_id IS NULL THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.gift_codes WHERE code = public.normalize_gift_code(p_code) FOR UPDATE;
  IF v.code IS NULL THEN RAISE EXCEPTION 'El código no existe.'; END IF;
  IF v.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'Un código canjeado no se puede modificar.'; END IF;
  IF v.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Un código anulado no se puede modificar.'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'La fecha límite de canje debe ser futura.'; END IF;
  UPDATE public.gift_codes SET expires_at = p_expires_at WHERE code = v.code;
  INSERT INTO public.app_admin_audit(actor_user_id, actor_alias, action, details)
  VALUES (actor.user_id, actor.alias, 'gift_code.expiry_changed', jsonb_build_object('code', v.code, 'before', v.expires_at, 'after', p_expires_at));
END $$;

REVOKE ALL ON FUNCTION public.admin_revoke_gift_code_batch(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_gift_code_expiry(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_gift_code_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_gift_code_expiry(text, timestamptz) TO authenticated;

COMMIT;
