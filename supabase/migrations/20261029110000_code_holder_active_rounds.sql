-- Whoever entered an active quick round's code keeps it in "Partidas en curso" until it ends.
-- The caller is resolved server-side (session or Express credential), never from a parameter.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_my_code_quick_rounds() RETURNS SETOF public.golf_rounds
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT r.* FROM public.golf_rounds r
 JOIN public.express_round_participants ep ON ep.round_id=r.id AND ep.user_id=public.verified_round_actor()
 WHERE r.group_id IS NULL AND r.admin_withdrawn_at IS NULL AND r.status='active'
 ORDER BY r.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.list_my_code_quick_rounds() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_code_quick_rounds() TO anon,authenticated;

COMMIT;
