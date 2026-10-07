-- Express-only finalization ownership. Group and Team rounds are deliberately excluded.
ALTER TABLE public.golf_rounds
  ADD COLUMN IF NOT EXISTS responsible_user_id text;

CREATE TABLE IF NOT EXISTS public.express_round_participants (
  round_id uuid NOT NULL REFERENCES public.golf_rounds(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id)
);

ALTER TABLE public.express_round_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.express_round_actor(p_actor text)
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(auth.uid()::text, nullif(trim(p_actor), ''));
$$;

CREATE OR REPLACE FUNCTION public.register_express_round_access(
  p_round uuid,
  p_access_code text,
  p_actor text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.golf_rounds;
  actor text := public.express_round_actor(p_actor);
BEGIN
  SELECT * INTO r FROM public.golf_rounds WHERE id = p_round;
  IF r.id IS NULL OR r.group_id IS NOT NULL OR r.status <> 'active' THEN
    RAISE EXCEPTION 'La partida Express no está disponible';
  END IF;
  IF actor IS NULL OR upper(r.access_code) <> upper(trim(p_access_code)) THEN
    RAISE EXCEPTION 'Acceso no autorizado';
  END IF;
  IF actor = r.user_id THEN RETURN; END IF;

  INSERT INTO public.express_round_participants(round_id, user_id)
  VALUES (r.id, actor)
  ON CONFLICT (round_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_express_round_participants(
  p_round uuid,
  p_actor text
)
RETURNS TABLE(user_id text, label text, joined_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.golf_rounds;
  actor text := public.express_round_actor(p_actor);
BEGIN
  SELECT * INTO r FROM public.golf_rounds WHERE id = p_round;
  IF r.id IS NULL OR r.group_id IS NOT NULL OR actor IS DISTINCT FROM r.user_id THEN
    RAISE EXCEPTION 'Solo el creador puede consultar los participantes';
  END IF;

  RETURN QUERY
  SELECT ep.user_id,
    coalesce(nullif(up.display_name, ''), nullif(up.nick, ''),
      'Participante ' || row_number() OVER (ORDER BY ep.joined_at, ep.user_id)::text),
    ep.joined_at
  FROM public.express_round_participants ep
  LEFT JOIN public.user_profiles up ON up.user_id::text = ep.user_id
  WHERE ep.round_id = p_round
  ORDER BY ep.joined_at, ep.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_express_round_responsible(
  p_round uuid,
  p_responsible text,
  p_actor text
)
RETURNS public.golf_rounds
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.golf_rounds;
  actor text := public.express_round_actor(p_actor);
BEGIN
  SELECT * INTO r FROM public.golf_rounds WHERE id = p_round FOR UPDATE;
  IF r.id IS NULL OR r.group_id IS NOT NULL OR r.status <> 'active' OR actor IS DISTINCT FROM r.user_id THEN
    RAISE EXCEPTION 'Solo el creador puede designar al responsable de una partida Express activa';
  END IF;
  IF p_responsible IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.express_round_participants ep
    WHERE ep.round_id = r.id AND ep.user_id = p_responsible
  ) THEN
    RAISE EXCEPTION 'El responsable debe haberse unido a la partida';
  END IF;

  UPDATE public.golf_rounds
  SET responsible_user_id = p_responsible, updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_express_round_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor text := coalesce(auth.uid()::text, nullif(current_setting('app.express_finish_actor', true), ''));
BEGIN
  IF OLD.group_id IS NULL AND OLD.status = 'active' AND NEW.status = 'completed'
     AND NOT public.is_app_administrator()
     AND actor IS DISTINCT FROM OLD.user_id
     AND actor IS DISTINCT FROM OLD.responsible_user_id THEN
    RAISE EXCEPTION 'Solo el creador o el responsable puede finalizar la partida Express';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_express_round_completion ON public.golf_rounds;
CREATE TRIGGER guard_express_round_completion
BEFORE UPDATE OF status ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_express_round_completion();

CREATE OR REPLACE FUNCTION public.finish_express_round(p_round uuid, p_actor text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.golf_rounds;
  actor text := public.express_round_actor(p_actor);
BEGIN
  SELECT * INTO r FROM public.golf_rounds WHERE id = p_round FOR UPDATE;
  IF r.id IS NULL OR r.group_id IS NOT NULL OR r.status <> 'active' THEN
    RAISE EXCEPTION 'La partida Express no está activa';
  END IF;
  IF actor IS DISTINCT FROM r.user_id AND actor IS DISTINCT FROM r.responsible_user_id THEN
    RAISE EXCEPTION 'Solo el creador o el responsable puede finalizar la partida Express';
  END IF;

  PERFORM set_config('app.express_finish_actor', actor, true);
  UPDATE public.golf_rounds
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = r.id;
END;
$$;

REVOKE ALL ON FUNCTION public.express_round_actor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_express_round_access(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_express_round_participants(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_express_round_responsible(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_express_round(uuid, text) TO anon, authenticated;
