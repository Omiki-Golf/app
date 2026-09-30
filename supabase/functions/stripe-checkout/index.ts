import { checkedStripe, config, serviceClient, synchronize } from '../_shared/stripe.ts';
import { allowedOrigin, checkoutIntent } from '../_shared/stripe-domain.ts';
import { rateLimit } from '../_shared/admin.ts';

Deno.serve(async req => {
  const origin=req.headers.get('Origin') || '';
  const headers={'Access-Control-Allow-Origin':allowedOrigin(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  const reply=(value:unknown,status=200)=>Response.json(value,{status,headers});
  if(!allowedOrigin(origin)) return reply({error:'Origen no permitido.'},403);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(req.method!=='POST') return reply({error:'Método no permitido.'},405);
  let stage='authentication';
  try {
    const service=serviceClient();
    const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'') || '';
    const {data:{user},error:authError}=await service.auth.getUser(token);
    if(authError || !user?.email_confirmed_at || !user.email) return reply({error:'Confirma tu correo e inicia sesión.'},401);
    stage='permissions';
    const [{data:restriction,error:restrictionError},{data:admin,error:adminError}]=await Promise.all([
      service.from('app_user_restrictions').select('read_only').eq('user_id',user.id).maybeSingle(),
      service.from('app_administrators').select('user_id').eq('user_id',user.id).maybeSingle(),
    ]);
    if(restrictionError || adminError) throw new Error('No se pudieron comprobar los permisos.');
    if(restriction?.read_only || admin) return reply({error:'Esta cuenta no puede iniciar pagos.'},403);
    stage='rate-limit';
    await rateLimit(service,`stripe-checkout:${user.id}`,60,3600);
    stage='request';
    const raw=await req.text();
    if(raw.length>1024) return reply({error:'Solicitud demasiado grande.'},413);
    const input=JSON.parse(raw);
    if(!['create','status'].includes(input.action)) return reply({error:'Acción no válida.'},400);
    const intent=checkoutIntent(user.user_metadata);
    stage='stripe-account';
    const stripe=await checkedStripe();
    stage='configuration';
    const settings=await config(service);
    stage='checkout-state';
    const {data:existing,error:existingError}=await service.from('stripe_checkout_state').select('*').eq('user_id',user.id).maybeSingle();
    if(existingError) throw new Error('No se pudo comprobar el pago.');
    let expiredAttempt:string|null=null;
    if(existing?.session_id) {
      const previous=await stripe.checkout.sessions.retrieve(existing.session_id);
      if(previous.livemode || previous.client_reference_id!==user.id) throw new Error('Sesión no válida.');
      if(previous.status==='complete' && previous.subscription) {
        await synchronize(stripe,service,typeof previous.subscription==='string'?previous.subscription:previous.subscription.id);
        return reply({ok:true});
      }
      if(input.action==='status') return reply({ok:true});
      if(previous.status==='open') {
        if(existing.intent_id!==intent.id || existing.origin!==origin) return reply({error:'Hay un pago pendiente en otra sesión de registro.'},409);
        return reply({url:previous.url});
      }
      if(previous.status==='expired') expiredAttempt=existing.attempt_id;
    }
    if(input.action==='status') return reply({ok:true});
    // An unpersisted Stripe result can be recovered by replaying the SAME request/key.
    // After 24h a newly generated request needs operator reconciliation, never a second charge.
    if(existing && !existing.session_id && Date.now()-Date.parse(existing.created_at)>23*3600_000) return reply({error:'El pago pendiente necesita revisión. Contacta con administración.'},409);
    const price=settings.prices[`${intent.plan}_${intent.period}`];
    if(!price) throw new Error('Precio no configurado.');
    const {data:checkout,error:reserveError}=await service.rpc('reserve_stripe_checkout',{
      p_user:user.id,p_intent:intent.id,p_plan:intent.plan,p_period:intent.period,p_origin:origin,p_email:user.email,p_price:price,p_expired_attempt:expiredAttempt,
    });
    if(reserveError || !checkout) return reply({error:'No se puede iniciar otro pago. Comprueba si la cuenta ya tiene una suscripción.'},409);
    if(checkout.origin!==origin) return reply({error:'Continúa el pago desde la dirección donde lo iniciaste.'},409);
    const metadata={app:'omiki-sandbox',user_id:user.id,intent_id:checkout.intent_id,attempt_id:checkout.attempt_id};
    stage='stripe-session';
    const sessionParams={
      mode:'subscription' as const,payment_method_types:['card' as const],managed_payments:{enabled:false},customer_email:checkout.email,client_reference_id:user.id,
      line_items:[{price:checkout.price_id,quantity:1}],metadata,subscription_data:{metadata},locale:'es' as const,
      success_url:`${checkout.origin}/?stripe_checkout=success`,cancel_url:`${checkout.origin}/?stripe_checkout=cancelled`,
    };
    const session=await stripe.checkout.sessions.create(sessionParams,{idempotencyKey:`omiki-sandbox:${checkout.attempt_id}`});
    if(session.livemode || !session.url) throw new Error('Stripe no devolvió un pago de prueba.');
    stage='save-session';
    const {error:saveError}=await service.from('stripe_checkout_state').update({session_id:session.id}).eq('user_id',user.id).eq('attempt_id',checkout.attempt_id);
    if(saveError) throw new Error('No se pudo guardar el pago. Reintenta.');
    return reply({url:session.url});
  } catch(error) {
    console.error('Stripe checkout failed',error instanceof Error ? error.name : 'Error');
    const stripeError=error as {type?:unknown;code?:unknown;param?:unknown};
    const diagnostic=stage==='stripe-session' ? Object.fromEntries(
      ['type','code','param'].flatMap(key=>{
        const value=stripeError[key as keyof typeof stripeError];
        return typeof value==='string' && /^[a-zA-Z_\[\]]{1,80}$/.test(value) ? [[key,value]] : [];
      })) : undefined;
    return reply({error:'No se ha podido conectar con Stripe Sandbox. Reintenta o consulta con administración.',code:`checkout-${stage}`,diagnostic},503);
  }
});
