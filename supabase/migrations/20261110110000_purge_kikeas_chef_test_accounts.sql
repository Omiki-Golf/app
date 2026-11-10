BEGIN;

CREATE TEMP TABLE purge_users ON COMMIT DROP AS
SELECT DISTINCT u.id
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.user_id=u.id
WHERE lower(coalesce(p.nick,'')) LIKE 'kikeas%'
   OR lower(coalesce(p.nick,'')) LIKE 'chef%'
   OR lower(coalesce(p.display_name,'')) LIKE 'kikeas%'
   OR lower(coalesce(p.display_name,'')) LIKE 'chef%'
   OR lower(split_part(coalesce(u.email,''),'@',1)) LIKE 'kikeas%'
   OR lower(split_part(coalesce(u.email,''),'@',1)) LIKE 'chef%'
   OR lower(coalesce(u.raw_user_meta_data->>'nick','')) LIKE 'kikeas%'
   OR lower(coalesce(u.raw_user_meta_data->>'nick','')) LIKE 'chef%'
   OR lower(coalesce(u.raw_user_meta_data->>'display_name','')) LIKE 'kikeas%'
   OR lower(coalesce(u.raw_user_meta_data->>'display_name','')) LIKE 'chef%'
EXCEPT
SELECT user_id FROM public.app_administrators;

CREATE TEMP TABLE purge_groups ON COMMIT DROP AS
SELECT id FROM public.groups WHERE user_auth_id IN (SELECT id FROM purge_users);
CREATE TEMP TABLE purge_players ON COMMIT DROP AS
SELECT id FROM public.players
WHERE (auth_user_id IN (SELECT id FROM purge_users)
   OR lower(coalesce(name,'')) LIKE 'kikeas%'
   OR lower(coalesce(name,'')) LIKE 'chef%')
  AND coalesce(auth_user_id,'00000000-0000-0000-0000-000000000000'::uuid) NOT IN (SELECT user_id FROM public.app_administrators);
CREATE TEMP TABLE purge_rounds ON COMMIT DROP AS
SELECT DISTINCT r.id FROM public.golf_rounds r
LEFT JOIN public.round_players rp ON rp.round_id=r.id
WHERE r.created_by IN (SELECT id FROM purge_users)
   OR r.group_id IN (SELECT id FROM purge_groups)
   OR rp.user_id IN (SELECT id FROM purge_users)
   OR rp.player_id IN (SELECT id FROM purge_players)
   OR ((lower(coalesce(rp.name,'')) LIKE 'kikeas%' OR lower(coalesce(rp.name,'')) LIKE 'chef%')
       AND coalesce(rp.user_id,'00000000-0000-0000-0000-000000000000'::uuid) NOT IN (SELECT user_id FROM public.app_administrators));
CREATE TEMP TABLE purge_archived_rounds ON COMMIT DROP AS
SELECT DISTINCT ar.id FROM public.archived_rounds ar
WHERE ar.group_id IN (SELECT id FROM purge_groups)
   OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(coalesce(ar.final_ranking,'[]')||coalesce(ar.player_stats,'[]')||coalesce(ar.hole_scores,'[]')) e
     WHERE e->>'player_db_id' IN (SELECT id::text FROM purge_players)
   );

SELECT set_config('app.account_deletion','on',true);
SELECT set_config('app.nick_rename','on',true);

ALTER TABLE public.archived_rounds DISABLE TRIGGER USER;
ALTER TABLE public.golf_rounds DISABLE TRIGGER USER;
ALTER TABLE public.round_players DISABLE TRIGGER USER;
ALTER TABLE public.players DISABLE TRIGGER USER;
ALTER TABLE public.groups DISABLE TRIGGER USER;
ALTER TABLE public.group_members DISABLE TRIGGER USER;

UPDATE public.group_members SET invited_by=NULL WHERE invited_by IN (SELECT id FROM purge_users);
DELETE FROM public.group_invitations
WHERE invited_by IN (SELECT id FROM purge_users) OR invited_user_id IN (SELECT id FROM purge_users);
UPDATE public.pro_shop_purchases SET purchased_by=NULL WHERE purchased_by IN (SELECT id FROM purge_users);
DELETE FROM public.user_subscriptions WHERE user_id IN (SELECT id FROM purge_users);
DELETE FROM public.app_message_deliveries
WHERE kind='user' AND recipient_id IN (SELECT id FROM purge_users);

-- La limpieza administrativa elimina el archivo completo; no debe ejecutar los
-- ajustes inversos ni exigir un gestor interactivo para esas partidas.
DELETE FROM public.archived_rounds WHERE id IN (SELECT id FROM purge_archived_rounds);
DELETE FROM public.golf_rounds WHERE id IN (SELECT id FROM purge_rounds);
DELETE FROM public.daily_rankings
WHERE game_player_id IN (SELECT id FROM purge_players);
DELETE FROM public.handicap_adjustments
WHERE player_id IN (SELECT id FROM purge_players);
DELETE FROM public.players WHERE id IN (SELECT id FROM purge_players);
DELETE FROM public.groups WHERE id IN (SELECT id FROM purge_groups);

DELETE FROM public.app_message_deliveries d
USING public.app_messages m
WHERE d.message_id=m.id AND m.author_id IN (SELECT id FROM purge_users);
DELETE FROM public.app_messages WHERE author_id IN (SELECT id FROM purge_users);
DELETE FROM auth.users WHERE id IN (SELECT id FROM purge_users);

ALTER TABLE public.group_members ENABLE TRIGGER USER;
ALTER TABLE public.groups ENABLE TRIGGER USER;
ALTER TABLE public.players ENABLE TRIGGER USER;
ALTER TABLE public.round_players ENABLE TRIGGER USER;
ALTER TABLE public.golf_rounds ENABLE TRIGGER USER;
ALTER TABLE public.archived_rounds ENABLE TRIGGER USER;

SELECT set_config('app.nick_rename','off',true);
SELECT set_config('app.account_deletion','off',true);

COMMIT;
