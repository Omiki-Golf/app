BEGIN;
-- Paid access is granted only by trusted server code, never signup metadata.
CREATE OR REPLACE FUNCTION public.create_subscription_from_signup_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN NEW; END $$;
REVOKE INSERT, UPDATE, DELETE ON public.user_subscriptions FROM anon, authenticated;
DROP POLICY IF EXISTS "Users can create own subscription" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.user_subscriptions;
ALTER TABLE public.user_subscriptions ADD COLUMN stripe_subscription_id text UNIQUE,
 ADD COLUMN stripe_intent_id uuid, ADD COLUMN stripe_observed_at timestamptz;

CREATE TABLE public.stripe_checkout_state (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
 intent_id uuid NOT NULL, plan text NOT NULL CHECK(plan IN ('player','team','premium')),
 period text NOT NULL CHECK(period IN ('monthly','annual')),
 origin text NOT NULL, email text NOT NULL, price_id text NOT NULL,
 session_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.stripe_private_config (key text PRIMARY KEY, value jsonb NOT NULL);
ALTER TABLE public.stripe_checkout_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_private_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_checkout_state,public.stripe_private_config FROM anon,authenticated;
GRANT ALL ON public.stripe_checkout_state,public.stripe_private_config TO service_role;

CREATE FUNCTION public.reserve_stripe_checkout(p_user uuid,p_intent uuid,p_plan text,p_period text,p_origin text,p_email text,p_price text,p_expired_attempt uuid DEFAULT NULL)
RETURNS public.stripe_checkout_state LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.stripe_checkout_state;
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta no encontrada'; END IF;
 IF EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=p_user) OR EXISTS(SELECT 1 FROM public.app_user_restrictions WHERE user_id=p_user AND read_only) THEN RAISE EXCEPTION 'Cuenta no autorizada'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=p_user AND (stripe_subscription_id IS NOT NULL OR (status='active' AND plan_type IN ('player','team','premium') AND (current_period_end IS NULL OR current_period_end>now())))) THEN RAISE EXCEPTION 'La cuenta ya tiene una suscripción'; END IF;
 SELECT * INTO result FROM public.stripe_checkout_state WHERE user_id=p_user FOR UPDATE;
 IF result.user_id IS NOT NULL AND p_expired_attempt IS NOT NULL AND result.attempt_id=p_expired_attempt THEN
  DELETE FROM public.stripe_checkout_state WHERE user_id=p_user;
  result:=NULL;
 END IF;
 IF result.user_id IS NULL THEN
  INSERT INTO public.stripe_checkout_state(user_id,intent_id,plan,period,origin,email,price_id)
  VALUES(p_user,p_intent,p_plan,p_period,p_origin,p_email,p_price) RETURNING * INTO result;
 END IF;
 IF result.intent_id<>p_intent OR result.plan<>p_plan OR result.period<>p_period THEN RAISE EXCEPTION 'Hay otro pago pendiente para esta cuenta'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.sync_stripe_subscription(p_user uuid,p_attempt uuid,p_subscription text,p_status text,p_start timestamptz,p_end timestamptz,p_observed timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE checkout public.stripe_checkout_state; existing public.user_subscriptions;
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO checkout FROM public.stripe_checkout_state WHERE user_id=p_user AND attempt_id=p_attempt;
 IF checkout.user_id IS NULL OR p_subscription NOT LIKE 'sub_%' OR p_end<=p_start OR p_end IS NULL OR p_start IS NULL OR p_observed IS NULL THEN RAISE EXCEPTION 'Suscripción no válida'; END IF;
 SELECT * INTO existing FROM public.user_subscriptions WHERE user_id=p_user FOR UPDATE;
 IF existing.stripe_subscription_id IS NOT NULL AND existing.stripe_subscription_id<>p_subscription THEN RAISE EXCEPTION 'Suscripción en conflicto'; END IF;
 IF existing.stripe_observed_at IS NOT NULL AND existing.stripe_observed_at>=p_observed THEN RETURN; END IF;
 IF existing.user_id IS NOT NULL AND existing.stripe_subscription_id IS NULL AND existing.status='active' AND existing.plan_type IN ('player','team','premium') AND (existing.current_period_end IS NULL OR existing.current_period_end>now()) THEN RAISE EXCEPTION 'Existe un plan gestionado fuera de Stripe'; END IF;
 INSERT INTO public.user_subscriptions(user_id,plan_type,status,payment_hash,current_period_start,current_period_end,updated_at,stripe_subscription_id,stripe_intent_id,stripe_observed_at)
 VALUES(p_user,checkout.plan,p_status,'stripe_test:'||p_subscription,p_start,p_end,now(),p_subscription,checkout.intent_id,p_observed)
 ON CONFLICT(user_id) DO UPDATE SET plan_type=excluded.plan_type,status=excluded.status,payment_hash=excluded.payment_hash,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,updated_at=now(),stripe_subscription_id=excluded.stripe_subscription_id,stripe_intent_id=excluded.stripe_intent_id,stripe_observed_at=excluded.stripe_observed_at;
END $$;
REVOKE ALL ON FUNCTION public.reserve_stripe_checkout(uuid,uuid,text,text,text,text,text,uuid),public.sync_stripe_subscription(uuid,uuid,text,text,timestamptz,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stripe_checkout(uuid,uuid,text,text,text,text,text,uuid),public.sync_stripe_subscription(uuid,uuid,text,text,timestamptz,timestamptz,timestamptz) TO service_role;
COMMIT;
