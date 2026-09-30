import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { sandboxAccount, subscriptionStatus } from './stripe-domain.ts';
import { serverKeys } from './server-credentials.ts';
export { Stripe };
export function serviceClient() {
  const key = serverKeys(Deno.env.get('SUPABASE_SECRET_KEYS'))[0] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Falta la credencial de servidor.');
  return createClient(Deno.env.get('SUPABASE_URL')!, key, {auth:{persistSession:false,autoRefreshToken:false}});
}
export function stripeClient() {
  const key = Deno.env.get('STRIPE_SECRET_KEY') || '';
  if (!key.startsWith('sk_test_')) throw new Error('Falta configurar la clave de Stripe Sandbox.');
  return new Stripe(key, {apiVersion:'2025-08-27.basil', httpClient:Stripe.createFetchHttpClient()});
}
export async function checkedStripe() {
  const stripe = stripeClient();
  if ((await stripe.accounts.retrieve()).id !== sandboxAccount) throw new Error('La clave no pertenece al Sandbox de Omiki.');
  return stripe;
}
export async function config(service: ReturnType<typeof serviceClient>) {
  const {data,error} = await service.from('stripe_private_config').select('value').eq('key','sandbox').single();
  if (error || !data?.value?.webhook_secret) throw new Error('Stripe Sandbox aún no está configurado.');
  return data.value as {webhook_secret:string; webhook_id:string; prices:Record<string,string>};
}
export async function synchronize(stripe: Stripe, service: ReturnType<typeof serviceClient>, subscriptionId: string) {
  // Fetch current Stripe state instead of applying possibly reordered event payloads.
  const observed = new Date().toISOString();
  const sub = await stripe.subscriptions.retrieve(subscriptionId,{expand:['latest_invoice']});
  if (sub.livemode || sub.metadata.app !== 'omiki-sandbox') throw new Error('Suscripción ajena al Sandbox.');
  const {data:checkout,error} = await service.from('stripe_checkout_state').select('*').eq('user_id',sub.metadata.user_id).eq('attempt_id',sub.metadata.attempt_id).maybeSingle();
  if (error) throw new Error('No se pudo comprobar el registro.');
  if (!checkout) return; // Deleted accounts must not be recreated by delayed events.
  const item = sub.items.data[0];
  if (sub.items.data.length!==1 || item.price.id!==checkout.price_id || item.quantity!==1 || sub.metadata.intent_id!==checkout.intent_id) throw new Error('El precio o registro de Stripe no coincide.');
  const invoice = sub.latest_invoice;
  const paid = !!invoice && typeof invoice!=='string' && invoice.status==='paid';
  const {error:saveError} = await service.rpc('sync_stripe_subscription',{
    p_user:checkout.user_id,p_attempt:checkout.attempt_id,p_subscription:sub.id,
    p_status:subscriptionStatus(sub.status,paid),p_start:new Date(item.current_period_start*1000).toISOString(),
    p_end:new Date(item.current_period_end*1000).toISOString(),p_observed:observed,
  });
  if (saveError) throw new Error('No se pudo guardar la suscripción confirmada.');
}
