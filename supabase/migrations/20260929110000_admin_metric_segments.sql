-- Read-only: lists the people behind each "Requieren atención" count of admin_metrics_overview.
-- Segment rules must stay identical to that function's 'attention' and 'pending_stale' counts.
BEGIN;

CREATE FUNCTION public.admin_metric_segment(p_segment text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_app_administrator() THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
 IF p_segment IS NULL OR p_segment NOT IN ('inactive_60','never_played','expiring_7','stale_invitations') THEN RAISE EXCEPTION 'Segmento inválido'; END IF;
 IF p_segment='stale_invitations' THEN
  WITH matches AS (
   SELECT i.invited_user_id AS user_id,ip.nick,iu.email,g.id AS group_id,g.name AS group_name,g.group_code,
   bp.nick AS invited_by_nick,i.created_at
   FROM public.group_invitations i JOIN public.groups g ON g.id=i.group_id
   LEFT JOIN auth.users iu ON iu.id=i.invited_user_id LEFT JOIN public.user_profiles ip ON ip.user_id=i.invited_user_id
   LEFT JOIN public.user_profiles bp ON bp.user_id=i.invited_by
   WHERE i.status='pending' AND i.created_at<now()-interval '14 days'
  ), shown AS (SELECT *,row_number() OVER (ORDER BY created_at,user_id) AS ord FROM matches ORDER BY created_at,user_id LIMIT 200)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM matches),
   'rows',coalesce((SELECT jsonb_agg(to_jsonb(s)-'ord' ORDER BY s.ord) FROM shown s),'[]'::jsonb)) INTO result;
  RETURN result;
 END IF;
 WITH players AS (SELECT * FROM public.admin_metric_players()),
 last_played AS (SELECT pa.user_id,max(r.created_at) AS last_at FROM public.admin_metric_participations() pa
  JOIN public.admin_metric_played_rounds() r ON r.id=pa.round_id GROUP BY pa.user_id),
 matches AS (
  SELECT u.user_id,p.nick,p.display_name,au.email,u.plan,u.created_at,u.last_sign_in_at,l.last_at AS last_round_at,
  CASE WHEN u.plan<>'express' THEN s.current_period_end END AS current_period_end,
  CASE p_segment WHEN 'inactive_60' THEN l.last_at WHEN 'expiring_7' THEN s.current_period_end ELSE u.created_at END AS sort_at
  FROM players u JOIN auth.users au ON au.id=u.user_id
  LEFT JOIN public.user_profiles p ON p.user_id=u.user_id
  LEFT JOIN last_played l ON l.user_id=u.user_id
  LEFT JOIN public.user_subscriptions s ON s.user_id=u.user_id
  WHERE (p_segment='inactive_60' AND l.last_at<now()-interval '60 days')
  OR (p_segment='never_played' AND l.user_id IS NULL AND u.created_at<now()-interval '7 days')
  OR (p_segment='expiring_7' AND u.plan<>'express' AND s.current_period_end<=now()+interval '7 days')
 ), shown AS (SELECT *,row_number() OVER (ORDER BY sort_at,user_id) AS ord FROM matches ORDER BY sort_at,user_id LIMIT 200)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM matches),
  'rows',coalesce((SELECT jsonb_agg(to_jsonb(s)-'ord'-'sort_at' ORDER BY s.ord) FROM shown s),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.admin_metric_segment(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_metric_segment(text) TO authenticated;
COMMIT;
