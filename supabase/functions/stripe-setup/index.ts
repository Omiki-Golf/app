import { checkedStripe, serviceClient } from '../_shared/stripe.ts';
import { prices } from '../_shared/stripe-domain.ts';
import { isServerRequest } from '../_shared/server-credentials.ts';

// Deployment-only operation. Never accepts a player's JWT or browser request.
Deno.serve(async req => {
  if (req.method!=='POST' || !isServerRequest(req.headers,Deno.env.get('SUPABASE_SECRET_KEYS'))) return Response.json({error:'Unauthorized'},{status:401});
  let stage='stripe-account';
  try {
    const stripe=await checkedStripe();
    const service=serviceClient();
    stage='prices';
    const catalog:Record<string,string>={};
    for (const [plan,periods] of Object.entries(prices)) {
      for (const [period,amount] of Object.entries(periods)) {
        const lookup=`omiki_${plan}_${period}_v1`;
        const existing=await stripe.prices.list({lookup_keys:[lookup],active:true,limit:1});
        const price=existing.data[0] ?? await stripe.prices.create({
          currency:'eur',unit_amount:amount,lookup_key:lookup,
          recurring:{interval:period==='annual'?'year':'month'},
          product_data:{name:`Omiki ${plan[0].toUpperCase()+plan.slice(1)} · ${period==='annual'?'Anual':'Mensual'}`},
        },{idempotencyKey:lookup});
        if(price.livemode || price.currency!=='eur' || price.unit_amount!==amount || price.recurring?.interval!==(period==='annual'?'year':'month') || price.recurring?.interval_count!==1) throw new Error('El catálogo no coincide.');
        catalog[`${plan}_${period}`]=price.id;
      }
    }
    stage='read-config';
    const {data:saved,error:readError}=await service.from('stripe_private_config').select('value').eq('key','sandbox').maybeSingle();
    if(readError) throw new Error('No se pudo leer la configuración.');
    let webhookId=saved?.value?.webhook_id;
    let webhookSecret=saved?.value?.webhook_secret;
    if(!webhookId || !webhookSecret) {
      stage='webhook';
      const endpoint=await stripe.webhookEndpoints.create({
        url:`${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-webhook`,api_version:'2025-08-27.basil',
        description:'Omiki Sandbox subscriptions',
        enabled_events:['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'],
      },{idempotencyKey:'omiki-sandbox-webhook-v1'});
      webhookId=endpoint.id; webhookSecret=endpoint.secret;
    }
    if(!webhookSecret) throw new Error('Falta la firma del webhook.');
    stage='save-config';
    const {error}=await service.from('stripe_private_config').upsert({key:'sandbox',value:{prices:catalog,webhook_id:webhookId,webhook_secret:webhookSecret}});
    if(error) throw new Error('No se pudo guardar la configuración.');
    // Verify account readiness without charging a card or creating a customer.
    stage='checkout-readiness';
    try {
      const probeParams={mode:'subscription' as const,payment_method_types:['card' as const],managed_payments:{enabled:false},
        line_items:[{price:catalog.player_monthly,quantity:1}],locale:'es' as const,
        success_url:'http://localhost:5173/?stripe_checkout=success',cancel_url:'http://localhost:5173/?stripe_checkout=cancelled'};
      const probe=await stripe.checkout.sessions.create(probeParams);
      await stripe.checkout.sessions.expire(probe.id);
    } catch(error) {
      // This response is restricted to the deployment secret, never a browser.
      const reason=error instanceof Error ? error.message.replace(/(?:sk|rk|pk)_(?:test|live)_\S+/g,'[redacted]').slice(0,500) : 'Unknown error';
      return Response.json({error:'Checkout readiness failed',stage,reason},{status:503});
    }
    return Response.json({ok:true,prices:catalog,webhook_id:webhookId});
  } catch(error) {
    // Do not include SDK responses, authorization headers or signing secrets.
    console.error('Stripe sandbox setup failed',error instanceof Error ? error.name : 'Error');
    return Response.json({error:'No se pudo configurar Stripe. Comprueba STRIPE_SECRET_KEY y los permisos del Sandbox.',stage},{status:503});
  }
});
