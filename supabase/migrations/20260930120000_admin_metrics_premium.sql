-- Preserve Premium after the September 29 administration metrics integration.
-- Read-only functions only; existing subscription data and historical migrations are unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_metric_players()
RETURNS TABLE(user_id uuid, created_at timestamptz, last_sign_in_at timestamptz, plan text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT u.id,u.created_at,u.last_sign_in_at,
 CASE WHEN s.status='active' AND (s.current_period_end IS NULL OR s.current_period_end>now()) AND s.plan_type IN ('player','team','premium') THEN s.plan_type ELSE 'express' END
 FROM auth.users u LEFT JOIN public.user_subscriptions s ON s.user_id=u.id
 WHERE NOT EXISTS (SELECT 1 FROM public.app_administrators a WHERE a.user_id=u.id)
 AND coalesce(u.raw_app_meta_data->>'app_account_type','')<>'administrator';
$$;

CREATE OR REPLACE FUNCTION public.admin_metrics_overview(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE since timestamptz; result jsonb;
BEGIN
 IF NOT public.is_app_administrator() THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
 IF p_days IS NULL OR p_days NOT IN (7,30,90,365) THEN RAISE EXCEPTION 'Periodo inválido'; END IF;
 since:=now()-make_interval(days=>p_days);
 WITH players AS (SELECT * FROM public.admin_metric_players()),
 played AS (SELECT * FROM public.admin_metric_played_rounds()),
 recent AS (SELECT * FROM played WHERE created_at>=since),
 part AS (SELECT pa.user_id,r.created_at FROM public.admin_metric_participations() pa
  JOIN played r ON r.id=pa.round_id JOIN players u ON u.user_id=pa.user_id),
 last_played AS (SELECT user_id,max(created_at) AS last_at FROM part GROUP BY user_id),
 freq AS (SELECT user_id,count(*) AS n FROM part WHERE created_at>=now()-interval '90 days' GROUP BY user_id),
 weeks AS (SELECT generate_series(date_trunc('week',now())-interval '11 weeks',date_trunc('week',now()),interval '1 week') AS week),
 members AS (SELECT g.id,(SELECT count(*) FROM public.group_members m WHERE m.group_id=g.id) AS n FROM public.groups g)
 SELECT jsonb_build_object(
  'days',p_days,
  'users',jsonb_build_object(
   'total',(SELECT count(*) FROM players),
   'new',(SELECT count(*) FROM players WHERE created_at>=since),
   'with_round',(SELECT count(DISTINCT user_id) FROM part WHERE created_at>=since),
   'signed_in',(SELECT count(*) FROM players WHERE last_sign_in_at>=since),
   'plans',jsonb_build_object(
    'express',(SELECT count(*) FROM players WHERE plan='express'),
    'player',(SELECT count(*) FROM players WHERE plan='player'),
    'team',(SELECT count(*) FROM players WHERE plan='team'),
    'premium',(SELECT count(*) FROM players WHERE plan='premium'))),
  'rounds',jsonb_build_object(
   'played',(SELECT count(*) FROM recent),
   'quick',(SELECT count(*) FROM recent WHERE group_id IS NULL),
   'group',(SELECT count(*) FROM recent WHERE group_id IS NOT NULL),
   'nine_holes',(SELECT count(*) FROM recent WHERE num_holes=9),
   'in_progress',(SELECT count(*) FROM public.golf_rounds WHERE status='active' AND admin_withdrawn_at IS NULL)),
  'weekly',(SELECT jsonb_agg(jsonb_build_object('week',w.week,
    'quick',(SELECT count(*) FROM played p WHERE p.group_id IS NULL AND p.created_at>=w.week AND p.created_at<w.week+interval '1 week'),
    'group',(SELECT count(*) FROM played p WHERE p.group_id IS NOT NULL AND p.created_at>=w.week AND p.created_at<w.week+interval '1 week'))
    ORDER BY w.week) FROM weeks w),
  'modes',coalesce((SELECT jsonb_agg(jsonb_build_object('mode',mode,'count',n) ORDER BY n DESC,mode)
    FROM (SELECT game_mode AS mode,count(*) AS n FROM recent GROUP BY game_mode) m),'[]'::jsonb),
  'courses',coalesce((SELECT jsonb_agg(jsonb_build_object('course',name,'count',n) ORDER BY n DESC,name)
    FROM (SELECT coalesce(c.name,'Campo sin nombre') AS name,count(*) AS n FROM recent r
     LEFT JOIN public.golf_courses c ON c.id=r.course_id GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 8) x),'[]'::jsonb),
  'frequency',jsonb_build_object(
   'weekly',(SELECT count(*) FROM freq WHERE n>=12),
   'few_per_month',(SELECT count(*) FROM freq WHERE n BETWEEN 6 AND 11),
   'monthly',(SELECT count(*) FROM freq WHERE n BETWEEN 3 AND 5),
   'occasional',(SELECT count(*) FROM freq WHERE n BETWEEN 1 AND 2)),
  'groups',jsonb_build_object(
   'total',(SELECT count(*) FROM public.groups),
   'new',(SELECT count(*) FROM public.groups WHERE created_at>=since),
   'active',(SELECT count(DISTINCT group_id) FROM recent WHERE group_id IS NOT NULL),
   'avg_members',(SELECT round(avg(n),1) FROM members WHERE n>0)),
  'invitations',jsonb_build_object(
   'sent',(SELECT count(*) FROM public.group_invitations WHERE created_at>=since),
   'accepted',(SELECT count(*) FROM public.group_invitations WHERE created_at>=since AND status='accepted'),
   'pending_stale',(SELECT count(*) FROM public.group_invitations WHERE status='pending' AND created_at<now()-interval '14 days')),
  'attention',jsonb_build_object(
   'inactive_60',(SELECT count(*) FROM last_played WHERE last_at<now()-interval '60 days'),
   'never_played',(SELECT count(*) FROM players u WHERE u.created_at<now()-interval '7 days'
     AND NOT EXISTS (SELECT 1 FROM last_played l WHERE l.user_id=u.user_id)),
   'expiring_7',(SELECT count(*) FROM players u JOIN public.user_subscriptions s ON s.user_id=u.user_id
     WHERE u.plan<>'express' AND s.current_period_end<=now()+interval '7 days'))
 ) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_app_users(p_search text DEFAULT '', p_plan text DEFAULT '', p_blocked boolean DEFAULT NULL, p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_app_administrator() THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 OR length(p_search)>200 OR p_plan NOT IN ('','express','player','team','premium') THEN RAISE EXCEPTION 'Filtro inválido'; END IF;
 WITH users AS (
 SELECT u.id AS user_id,u.email,u.created_at,u.last_sign_in_at,p.nick,p.display_name,
 coalesce(r.read_only,false) AS read_only,
 CASE WHEN s.status='active' AND (s.current_period_end IS NULL OR s.current_period_end>now()) AND s.plan_type IN ('player','team','premium') THEN s.plan_type ELSE 'express' END AS plan
 FROM auth.users u LEFT JOIN public.user_profiles p ON p.user_id=u.id
 LEFT JOIN public.user_subscriptions s ON s.user_id=u.id
 LEFT JOIN public.app_user_restrictions r ON r.user_id=u.id
 WHERE NOT EXISTS (SELECT 1 FROM public.app_administrators a WHERE a.user_id=u.id)
 AND coalesce(u.raw_app_meta_data->>'app_account_type','')<>'administrator'
 ), filtered AS (
 SELECT * FROM users WHERE (p_plan='' OR plan=p_plan) AND (p_blocked IS NULL OR read_only=p_blocked)
 AND (coalesce(p_search,'')='' OR strpos(lower(concat_ws(' ',email,nick,display_name,user_id::text)),lower(p_search))>0)
 ), page AS (
 SELECT f.*,stats.rounds_played,stats.last_round_at,
 (SELECT count(*) FROM public.group_members m WHERE m.user_id=f.user_id) AS groups_count
 FROM (SELECT * FROM filtered ORDER BY created_at DESC,user_id LIMIT 25 OFFSET p_page*25) f
 CROSS JOIN LATERAL (SELECT count(*) AS rounds_played,max(created_at) AS last_round_at FROM public.admin_metric_user_rounds(f.user_id)) stats
 )
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'users',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,user_id) FROM page),'[]'::jsonb)) INTO result;
 RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_metric_players() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_metrics_overview(integer),public.admin_list_app_users(text,text,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_metrics_overview(integer),public.admin_list_app_users(text,text,boolean,integer) TO authenticated;
COMMIT;
