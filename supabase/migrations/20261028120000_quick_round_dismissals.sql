BEGIN;

-- A linked participant can hide another player's quick round from their own lists and stats.
-- The round, its players and scores stay untouched for everyone else.
CREATE TABLE public.quick_round_dismissals (
  round_id uuid NOT NULL REFERENCES public.golf_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id)
);
CREATE INDEX quick_round_dismissals_user ON public.quick_round_dismissals(user_id);
ALTER TABLE public.quick_round_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quick_round_dismissals FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.dismiss_quick_round(p_round uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.golf_rounds;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'No tienes permiso para descartar partidas' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.golf_rounds WHERE id=p_round;
 IF r.id IS NULL OR r.group_id IS NOT NULL OR r.user_id=auth.uid()::text
    OR NOT EXISTS(SELECT 1 FROM public.round_players rp WHERE rp.round_id=r.id AND rp.user_id=auth.uid()) THEN
  RAISE EXCEPTION 'No puedes descartar esta partida' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.quick_round_dismissals(round_id,user_id) VALUES(r.id,auth.uid()) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.list_my_quick_rounds(p_statuses text[]) RETURNS SETOF public.golf_rounds
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT r.* FROM public.golf_rounds r
 WHERE r.group_id IS NULL AND r.admin_withdrawn_at IS NULL AND r.status=ANY(p_statuses)
 AND (r.user_id=auth.uid()::text OR EXISTS(SELECT 1 FROM public.round_players rp WHERE rp.round_id=r.id AND rp.user_id=auth.uid()))
 AND NOT EXISTS(SELECT 1 FROM public.quick_round_dismissals d WHERE d.round_id=r.id AND d.user_id=auth.uid())
 ORDER BY r.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.dismiss_quick_round(uuid),public.list_my_quick_rounds(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_quick_round(uuid),public.list_my_quick_rounds(text[]) TO authenticated;

COMMIT;
