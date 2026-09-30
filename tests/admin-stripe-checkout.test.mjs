import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { checkoutIntent, prices, allowedOrigin, subscriptionStatus } from '../supabase/functions/_shared/stripe-domain.ts';
import { planCatalog, annualPlanPrice } from '../src/data/planCatalog.ts';
import { serverKeys, isServerRequest } from '../supabase/functions/_shared/server-credentials.ts';
test('Stripe setup accepts only a provisioned server secret on apikey',()=>{
 const secret='sb_secret_test_server_credential';
 const env=JSON.stringify({default:secret});
 assert.equal(isServerRequest(new Headers({apikey:secret}),env),true);
 for(const headers of [{},{apikey:'sb_publishable_test'},{apikey:'sb_secret_unrecognized_credential'},{Authorization:`Bearer ${secret}`},{Authorization:'Bearer undefined'}]) {
  assert.equal(isServerRequest(new Headers(headers),env),false);
 }
 for(const value of [undefined,'invalid','null','[]','{"default":null}','{"default":""}']) {
  assert.deepEqual(serverKeys(value),[]);
  assert.equal(isServerRequest(new Headers({apikey:secret}),value),false);
 }
});
const uid='00000000-0000-4000-8000-000000000001';
const intent='00000000-0000-4000-8000-000000000002';
test('Stripe server catalog matches displayed totals; malformed intents and origins are rejected',()=>{
 for(const plan of planCatalog.filter(p=>p.id!=='express')) {
  assert.equal(prices[plan.id].monthly,Math.round(plan.monthly*100));
  assert.equal(prices[plan.id].annual,Math.round(annualPlanPrice(plan.monthly)*100));
 }
 for(const patch of [{plan:'__proto__'},{period:'weekly'},{id:'not-a-uuid'}]) assert.throws(()=>checkoutIntent({player_checkout:{id:intent,period:'monthly',...patch}}));
 assert.equal(checkoutIntent({player_checkout:{id:intent,period:'monthly'}}).plan,'player');
 assert.equal(allowedOrigin('https://golf.arinsaldev.com.evil.example'),false);
 assert.equal(allowedOrigin('http://localhost:5173'),true);
 assert.equal(subscriptionStatus('active',false),'expired');
 assert.equal(subscriptionStatus('past_due',true),'expired');
 assert.equal(subscriptionStatus('active',true),'active');
 assert.equal(subscriptionStatus('canceled',true),'cancelled');
});
test('Stripe database: browser cannot grant plans, checkout retries reuse attempts, sync is idempotent and older observations cannot reactivate cancellation',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb);
   CREATE TABLE public.app_administrators(user_id uuid); CREATE TABLE public.app_user_restrictions(user_id uuid,read_only boolean);
   CREATE TABLE public.user_subscriptions(id uuid DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES auth.users(id),plan_type text,status text CHECK(status IN ('active','expired','cancelled')),payment_hash text,current_period_start timestamptz,current_period_end timestamptz,updated_at timestamptz);
   GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
   GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_subscriptions TO authenticated;
   INSERT INTO auth.users VALUES('${uid}','{}');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260923100000_stripe_sandbox_checkout.sql',import.meta.url),'utf8'));
  await db.exec(`SET ROLE authenticated`);
  await assert.rejects(db.exec(`INSERT INTO public.user_subscriptions(user_id,plan_type,status) VALUES('${uid}','premium','active')`),/permission denied/);
  await assert.rejects(db.exec(`SELECT * FROM public.stripe_private_config`),/permission denied/);
  await assert.rejects(db.exec(`SELECT public.reserve_stripe_checkout('${uid}','${intent}','player','monthly','http://localhost:5173','test@example.com','price_test')`),/permission denied/);
  await db.exec(`RESET ROLE; SET ROLE service_role`);
  const reserve=()=>db.query(`SELECT * FROM public.reserve_stripe_checkout($1,$2,'player','monthly','http://localhost:5173','test@example.com','price_test')`,[uid,intent]);
  const first=(await reserve()).rows[0];
  assert.equal((await reserve()).rows[0].attempt_id,first.attempt_id);
  const sync=(status,observed,sub='sub_test')=>db.query(`SELECT public.sync_stripe_subscription($1,$2,$3,$4,'2026-09-22','2026-10-22',$5)`,[uid,first.attempt_id,sub,status,observed]);
  await sync('active','2026-09-22T10:00:00Z');
  await sync('active','2026-09-22T10:00:00Z');
  await assert.rejects(reserve(),/ya tiene una suscripción/);
  await assert.rejects(sync('active','2026-09-22T12:00:00Z','sub_other'),/conflicto/);
  await sync('cancelled','2026-09-22T12:00:00Z');
  await sync('active','2026-09-22T11:00:00Z');
  await db.exec('RESET ROLE');
  const rows=(await db.query('SELECT * FROM public.user_subscriptions')).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].status,'cancelled');
  assert.equal(rows[0].stripe_intent_id,intent);
  await db.exec('CREATE TRIGGER signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_subscription_from_signup_plan()');
  await db.query('INSERT INTO auth.users VALUES($1,$2)',[intent,JSON.stringify({requested_plan:'premium',user_tier:'team'})]);
  assert.equal((await db.query('SELECT * FROM public.user_subscriptions WHERE user_id=$1',[intent])).rows.length,0);
 } finally {await db.close();}
});
