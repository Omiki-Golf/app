import { checkedStripe, config, serviceClient, synchronize } from '../_shared/stripe.ts';
import { allowedOrigin, checkoutIntent, teamTrialOffer, teamTrialOfferActive } from '../_shared/stripe-domain.ts';
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
    const {data:currentSubscription,error:currentSubscriptionError}=await service.from('user_subscriptions')
      .select('plan_type,status,current_period_end,stripe_subscription_id,team_trial_ends_at').eq('user_id',user.id).maybeSingle();
    if(currentSubscriptionError) throw new Error('No se pudo comprobar la suscripción actual.');
    const offer=intent.offer==='team_trial';
    const ranks:Record<string,number>={player:1,team:2,premium:3};
    const isUpgrade=input.action==='create' && currentSubscription?.stripe_subscription_id && currentSubscription.status==='active'
      && (!currentSubscription.current_period_end || Date.parse(currentSubscription.current_period_end)>Date.now())
      && (ranks[intent.plan]??0)>(ranks[currentSubscription.plan_type]??0);
    // La oferta de fin de prueba solo existe como mejora de una suscripción Player de Stripe.
    if(offer && input.action==='create' && (!isUpgrade || !teamTrialOfferActive(currentSubscription)))
      return reply({error:'La oferta de Team ya no está disponible para esta cuenta.'},409);
    if(isUpgrade) {
      stage='subscription-upgrade';
      const targetPrice=settings.prices[`${intent.plan}_${intent.period}`];
      // Con la oferta se puede pasar de Player mensual o anual a Team anual.
      const currentPrices=offer
        ? [settings.prices.player_monthly,settings.prices.player_annual]
        : [settings.prices[`${currentSubscription.plan_type}_${intent.period}`]];
      if(!targetPrice || currentPrices.some(price=>!price)) throw new Error('Precio no configurado.');
      const subscription=await stripe.subscriptions.retrieve(currentSubscription.stripe_subscription_id,{expand:['latest_invoice']});
      if(subscription.livemode || subscription.metadata.app!=='omiki-sandbox' || subscription.metadata.user_id!==user.id || subscription.items.data.length!==1)
        throw new Error('Suscripción no válida para mejorar.');
      if(!currentPrices.includes(subscription.items.data[0].price.id))
        return reply({error:'Elige la misma periodicidad que tu plan Player actual.'},409);
      const metadata={app:'omiki-sandbox',user_id:user.id,intent_id:intent.id,attempt_id:intent.id,...(offer?{offer:'team_trial'}:{})};
      if(subscription.metadata.intent_id!==intent.id) {
        const {error:clearError}=await service.from('stripe_checkout_state').delete().eq('user_id',user.id);
        if(clearError) throw new Error('No se pudo preparar el cambio de plan.');
        const {error:stateError}=await service.from('stripe_checkout_state').insert({
          user_id:user.id,attempt_id:intent.id,intent_id:intent.id,plan:intent.plan,period:intent.period,
          origin,email:user.email,price_id:targetPrice,session_id:null,
        });
        if(stateError) throw new Error('No se pudo registrar el cambio de plan.');
        await stripe.subscriptions.update(subscription.id,{
          metadata,items:[{id:subscription.items.data[0].id,price:targetPrice,quantity:1}],
          proration_behavior:'always_invoice',payment_behavior:'error_if_incomplete',expand:['latest_invoice'],
          // Oferta: empieza un año de Team desde hoy, con 10 € menos en esa primera factura
          // y descontando lo que quedaba sin usar de Player.
          ...(offer?{billing_cycle_anchor:'now' as const,discounts:[{coupon:teamTrialOffer.coupon}]}:{}),
        },{idempotencyKey:`omiki-upgrade:${intent.id}`});
      }
      await synchronize(stripe,service,subscription.id);
      return reply({ok:true,upgraded:true});
    }
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
      mode:'subscription' as const,payment_method_types:['card' as const],managed_payments:{enabled:false},adaptive_pricing:{enabled:true},customer_email:checkout.email,client_reference_id:user.id,
      line_items:[{price:checkout.price_id,quantity:1}],metadata,subscription_data:{metadata},locale:'auto' as const,
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
        return typeof value==='string' && /^[a-zA-Z_\x5B\x5D]{1,80}$/.test(value) ? [[key,value]] : [];
      })) : undefined;
    return reply({error:'No se ha podido conectar con Stripe Sandbox. Reintenta o consulta con administración.',code:`checkout-${stage}`,diagnostic},503);
  }
});
