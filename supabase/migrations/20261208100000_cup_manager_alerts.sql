-- Copa Match Play: aviso en Inicio también para el creador y los administradores del grupo.
-- list_my_cup_shortcuts añade 'manage' cuando hay algo que gestionar: cuadro preparado sin publicar,
-- inscripciones con la fecha límite vencida, partida finalizada sin registrar, plazo de un cruce
-- vencido o un cruce entre dos invitados sin cuenta pendiente de anotar en papel.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_my_cup_shortcuts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('group_id', e.group_id, 'edition_id', e.id, 'status', e.status, 'name', e.name,
    'group_name', (SELECT coalesce(nullif(g.name, ''), g.group_code) FROM public.groups g WHERE g.id = e.group_id),
    'pending', e.status = 'active' AND EXISTS (
      SELECT 1 FROM public.cup_matches m JOIN public.cup_entrants x ON x.id IN (m.entrant_a, m.entrant_b)
      WHERE m.edition_id = e.id AND x.user_id = auth.uid() AND m.winner_entrant IS NULL
        AND m.entrant_a IS NOT NULL AND m.entrant_b IS NOT NULL),
    'invited', e.status = 'registration' AND EXISTS (
      SELECT 1 FROM public.cup_entrants x WHERE x.edition_id = e.id AND x.user_id = auth.uid() AND x.registration = 'pending'),
    'manage', public.cup_is_manager(e.group_id) AND (
      e.status = 'draw_ready'
      OR (e.status = 'registration' AND e.registration_deadline < now())
      OR (e.status = 'active' AND (
        EXISTS (
          SELECT 1 FROM public.golf_rounds r JOIN public.cup_matches m ON m.id = r.cup_match_id
          WHERE m.edition_id = e.id AND r.status = 'completed'
            AND NOT EXISTS (SELECT 1 FROM public.cup_games g WHERE g.round_id = r.id))
        OR EXISTS (
          SELECT 1 FROM public.cup_matches m
          WHERE m.edition_id = e.id AND m.winner_entrant IS NULL AND m.entrant_a IS NOT NULL AND m.entrant_b IS NOT NULL
            AND (m.deadline < now()
              OR NOT EXISTS (SELECT 1 FROM public.cup_entrants x WHERE x.id IN (m.entrant_a, m.entrant_b) AND x.user_id IS NOT NULL)))
      ))
    ))), '[]'::jsonb)
  FROM public.cup_editions e
  WHERE auth.uid() IS NOT NULL AND e.status NOT IN ('finished','cancelled')
    AND (coalesce(public.can_manage_group_messages(e.group_id), false)
      OR EXISTS (SELECT 1 FROM public.cup_entrants x WHERE x.edition_id = e.id AND x.user_id = auth.uid()))
$$;

REVOKE ALL ON FUNCTION public.list_my_cup_shortcuts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_cup_shortcuts() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
