BEGIN;
-- Premium is a distinct plan; existing plans and subscription dates are unchanged.
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_plan_type_check;
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_plan_type_check CHECK (plan_type IN ('free','express','player','team','premium'));

CREATE OR REPLACE FUNCTION public.admin_list_app_users(p_search text DEFAULT '', p_plan text DEFAULT '', p_blocked boolean DEFAULT NULL, p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_app_administrator() THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 OR length(p_search)>200 OR p_plan NOT IN ('','express','player','team','premium') THEN RAISE EXCEPTION 'Filtro inválido'; END IF;
 WITH users AS (
 SELECT u.id AS user_id,u.email,u.created_at,p.nick,p.display_name,
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
 ), page AS (SELECT * FROM filtered ORDER BY created_at DESC,user_id LIMIT 25 OFFSET p_page*25)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'users',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb)) INTO result;
 RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_get_app_user(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_app_administrator() THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('user_id',u.id,'email',u.email,'created_at',u.created_at,'profile',to_jsonb(p),
 'read_only',coalesce(r.read_only,false),'subscription',to_jsonb(s),
 'plan',CASE WHEN s.status='active' AND (s.current_period_end IS NULL OR s.current_period_end>now()) AND s.plan_type IN ('player','team','premium') THEN s.plan_type ELSE 'express' END)
 INTO result FROM auth.users u LEFT JOIN public.user_profiles p ON p.user_id=u.id
 LEFT JOIN public.user_subscriptions s ON s.user_id=u.id LEFT JOIN public.app_user_restrictions r ON r.user_id=u.id
 WHERE u.id=p_user_id AND NOT EXISTS(SELECT 1 FROM public.app_administrators a WHERE a.user_id=u.id)
 AND coalesce(u.raw_app_meta_data->>'app_account_type','')<>'administrator';
 IF result IS NULL THEN RAISE EXCEPTION 'Jugador no encontrado'; END IF;
 RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_update_app_user(p_user_id uuid,p_action text,p_values jsonb,p_reason text,p_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_data jsonb; after_data jsonb; actor public.app_administrators; end_date timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(20260910,1900);
 SELECT * INTO actor FROM public.app_administrators WHERE user_id=auth.uid() AND status='active';
 IF actor.user_id IS NULL THEN RAISE EXCEPTION 'Acceso denegado' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Indica un motivo de entre 3 y 500 caracteres'; END IF;
 PERFORM 1 FROM auth.users WHERE id=p_user_id FOR UPDATE;
 PERFORM 1 FROM public.user_profiles WHERE user_id=p_user_id FOR UPDATE;
 PERFORM 1 FROM public.user_subscriptions WHERE user_id=p_user_id FOR UPDATE;
 before_data:=public.admin_get_app_user(p_user_id);
 IF p_expected IS DISTINCT FROM before_data THEN RAISE EXCEPTION 'La ficha ha cambiado. Actualiza antes de guardar.'; END IF;
 IF p_action='profile' THEN
  IF before_data->'profile'='null'::jsonb THEN RAISE EXCEPTION 'El jugador debe completar su registro'; END IF;
  IF length(trim(coalesce(p_values->>'nick',''))) NOT BETWEEN 2 AND 50 OR length(trim(coalesce(p_values->>'display_name',''))) NOT BETWEEN 1 AND 100
   OR coalesce(p_values->>'default_tee','') NOT IN ('amarillo','rojo','blanco','azul')
   OR coalesce(p_values->>'avatar_url','') !~ '^/avatars/(leon|tigre|panda|oso|lobo|zorro|coneja|jirafa|erizo|ardilla|koala|elefante|pato|bulldog|rinoceronte)\.webp$'
   OR p_values->>'exact_handicap' IS NULL THEN RAISE EXCEPTION 'Datos de perfil inválidos'; END IF;
  IF (p_values->>'exact_handicap')::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Hándicap inválido'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_profiles WHERE lower(nick)=lower(trim(p_values->>'nick')) AND user_id<>p_user_id) THEN RAISE EXCEPTION 'El nick ya está en uso'; END IF;
  UPDATE public.user_profiles SET nick=trim(p_values->>'nick'),display_name=trim(p_values->>'display_name'),avatar_url=p_values->>'avatar_url',
   exact_handicap=(p_values->>'exact_handicap')::numeric,default_tee=p_values->>'default_tee',updated_at=now() WHERE user_id=p_user_id;
 ELSIF p_action='plan' THEN
  IF coalesce(p_values->>'plan','') NOT IN ('express','player','team','premium') THEN RAISE EXCEPTION 'Plan inválido'; END IF;
  end_date:=CASE WHEN p_values->>'plan'='express' THEN NULL ELSE (p_values->>'end')::timestamptz END;
  IF end_date<=now() THEN RAISE EXCEPTION 'La fecha de fin debe ser futura'; END IF;
  INSERT INTO public.user_subscriptions(user_id,plan_type,status,payment_hash,current_period_start,current_period_end,updated_at)
  VALUES(p_user_id,p_values->>'plan','active','admin:'||actor.user_id::text,now(),end_date,now())
  ON CONFLICT(user_id) DO UPDATE SET plan_type=excluded.plan_type,status='active',payment_hash=excluded.payment_hash,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,updated_at=now();
 ELSIF p_action='restriction' THEN
  IF jsonb_typeof(p_values->'read_only') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Bloqueo inválido'; END IF;
  INSERT INTO public.app_user_restrictions(user_id,read_only) VALUES(p_user_id,(p_values->>'read_only')::boolean)
  ON CONFLICT(user_id) DO UPDATE SET read_only=excluded.read_only,updated_at=now();
 ELSE RAISE EXCEPTION 'Acción inválida'; END IF;
 after_data:=public.admin_get_app_user(p_user_id);
 INSERT INTO public.app_admin_audit(actor_user_id,actor_alias,action,target_user_id,details)
 VALUES(actor.user_id,actor.alias,'user.'||p_action||'_changed',p_user_id,jsonb_build_object('reason',trim(p_reason),'before',
 CASE p_action WHEN 'profile' THEN before_data->'profile' WHEN 'plan' THEN before_data->'subscription' ELSE before_data->'read_only' END,'after',
 CASE p_action WHEN 'profile' THEN after_data->'profile' WHEN 'plan' THEN after_data->'subscription' ELSE after_data->'read_only' END));
 RETURN after_data;
END;
$$;

COMMIT;
