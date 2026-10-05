BEGIN;

CREATE FUNCTION public.admin_reassign_app_round(
  p_round_id uuid,
  p_user_id uuid,
  p_reason text,
  p_expected timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.golf_rounds;
  actor public.app_administrators;
BEGIN
  PERFORM pg_advisory_xact_lock(20261005, 1200);

  SELECT * INTO actor
  FROM public.app_administrators
  WHERE user_id = auth.uid() AND status = 'active';

  IF actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Indica un motivo de entre 3 y 500 caracteres';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'El jugador registrado no existe';
  END IF;

  SELECT * INTO r FROM public.golf_rounds WHERE id = p_round_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Partida no encontrada';
  END IF;
  IF r.group_id IS NOT NULL THEN
    RAISE EXCEPTION 'Las partidas de grupo no se pueden reasignar';
  END IF;
  IF r.admin_withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'Restaura la partida antes de reasignarla';
  END IF;
  IF r.updated_at IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'La partida ha cambiado. Actualiza la ficha.';
  END IF;
  IF r.user_id = p_user_id::text THEN
    RAISE EXCEPTION 'La partida ya pertenece a este jugador';
  END IF;
  IF r.status = 'active' AND EXISTS (
    SELECT 1
    FROM public.golf_rounds other
    WHERE other.id <> r.id
      AND other.user_id = p_user_id::text
      AND other.group_id IS NULL
      AND other.status = 'active'
      AND other.admin_withdrawn_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El jugador ya tiene otra partida rápida en curso. Finalízala antes de reasignar esta partida.';
  END IF;

  UPDATE public.golf_rounds SET user_id = p_user_id::text WHERE id = r.id;

  INSERT INTO public.app_admin_audit(
    actor_user_id, actor_alias, action, target_user_id, details
  ) VALUES (
    actor.user_id,
    actor.alias,
    'round.reassign',
    p_user_id,
    jsonb_build_object(
      'round_id', r.id,
      'reason', trim(p_reason),
      'before', r.user_id,
      'after', p_user_id::text
    )
  );

  RETURN public.admin_get_app_round(r.id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reassign_app_round(uuid, uuid, text, timestamptz)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reassign_app_round(uuid, uuid, text, timestamptz)
TO authenticated;

COMMIT;
