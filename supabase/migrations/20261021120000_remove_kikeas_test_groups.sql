-- One-time cleanup requested for the three kikeas test accounts.
-- The IDs and owners are asserted so this migration cannot delete a similarly
-- named group or any group created after the review.
DO $$
DECLARE
  matched integer;
BEGIN
  SELECT count(*) INTO matched
  FROM public.groups g
  WHERE (g.id,g.user_auth_id) IN (
    ('f5d8ec0a-37e7-42d4-a47c-8d24a2c0cfe4'::uuid,'7d7105b8-bbe9-45cb-8e36-49fe124d2c8f'::uuid),
    ('2a3950d2-b4d1-418c-bbf9-8895ddeb3157'::uuid,'deb5f2de-ae91-44fd-af45-a8aa3eef9c0d'::uuid),
    ('70b13376-a546-4f46-b052-9253f85c539c'::uuid,'3f172295-57f4-40d5-aaa7-270d7b2de632'::uuid),
    ('a296bc94-d719-4aab-93a3-2dcb5e329830'::uuid,'3f172295-57f4-40d5-aaa7-270d7b2de632'::uuid)
  );
  IF matched <> 4 THEN
    RAISE EXCEPTION 'Expected four reviewed kikeas groups, found %',matched;
  END IF;
END $$;

-- These application guards protect ordinary user actions. Foreign-key
-- constraint triggers remain enabled, so related rows are still cascaded.
ALTER TABLE public.players DISABLE TRIGGER USER;
ALTER TABLE public.group_members DISABLE TRIGGER USER;
ALTER TABLE public.round_players DISABLE TRIGGER USER;
ALTER TABLE public.archived_rounds DISABLE TRIGGER USER;
ALTER TABLE public.handicap_adjustments DISABLE TRIGGER USER;

DELETE FROM public.groups
WHERE id IN (
  'f5d8ec0a-37e7-42d4-a47c-8d24a2c0cfe4'::uuid,
  '2a3950d2-b4d1-418c-bbf9-8895ddeb3157'::uuid,
  '70b13376-a546-4f46-b052-9253f85c539c'::uuid,
  'a296bc94-d719-4aab-93a3-2dcb5e329830'::uuid
);

ALTER TABLE public.handicap_adjustments ENABLE TRIGGER USER;
ALTER TABLE public.archived_rounds ENABLE TRIGGER USER;
ALTER TABLE public.round_players ENABLE TRIGGER USER;
ALTER TABLE public.group_members ENABLE TRIGGER USER;
ALTER TABLE public.players ENABLE TRIGGER USER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.groups WHERE id IN (
      'f5d8ec0a-37e7-42d4-a47c-8d24a2c0cfe4'::uuid,
      '2a3950d2-b4d1-418c-bbf9-8895ddeb3157'::uuid,
      '70b13376-a546-4f46-b052-9253f85c539c'::uuid,
      'a296bc94-d719-4aab-93a3-2dcb5e329830'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'One or more reviewed groups remain after cleanup';
  END IF;
END $$;
