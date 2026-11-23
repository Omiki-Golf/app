BEGIN;

-- Foto de perfil propia: el archivo vive en Supabase Storage (bucket «avatars») y
-- user_profiles.avatar_url solo guarda su URL. Cada usuario solo escribe en su carpeta <uid>/.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 102400, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 102400, allowed_mime_types = ARRAY['image/webp', 'image/jpeg'];

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_own_insert" ON storage.objects;
CREATE POLICY "avatars_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_app_user_read_only());

DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
CREATE POLICY "avatars_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_app_user_read_only())
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text AND NOT public.is_app_user_read_only());

DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Edición de perfil desde administración: acepta cualquier avatar ilustrado de /avatars o
-- conservar el avatar actual del jugador (por ejemplo, su foto propia). El resto, igual que antes.
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
   OR NOT (coalesce(p_values->>'avatar_url','') ~ '^/avatars/[a-z0-9-]+\.webp$'
     OR p_values->>'avatar_url' IS NOT DISTINCT FROM before_data->'profile'->>'avatar_url')
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
