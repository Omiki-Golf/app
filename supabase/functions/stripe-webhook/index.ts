import { checkedStripe, config, serviceClient, Stripe, synchronize } from '../_shared/stripe.ts';
Deno.serve(async req => {
  if(req.method!=='POST') return new Response('Method not allowed',{status:405});
  const signature=req.headers.get('stripe-signature');
  if(!signature) return new Response('Missing signature',{status:400});
  try {
    const service=serviceClient();
    const settings=await config(service);
    const stripe=await checkedStripe();
    let event:Stripe.Event;
    try {
      event=await stripe.webhooks.constructEventAsync(await req.text(),signature,settings.webhook_secret,300,Stripe.createSubtleCryptoProvider());
    } catch { return new Response('Invalid signature',{status:400}); }
    if(event.livemode) return new Response('Sandbox only',{status:400});
    let id:string|null=null;
    if(event.type==='checkout.session.completed') {
      const session=event.data.object as Stripe.Checkout.Session;
      if(session.metadata?.app==='omiki-sandbox') id=typeof session.subscription==='string'?session.subscription:session.subscription?.id ?? null;
    } else if(event.type.startsWith('customer.subscription.')) {
      const sub=event.data.object as Stripe.Subscription;
      if(sub.metadata.app==='omiki-sandbox') id=sub.id;
    } else if(event.type==='invoice.paid' || event.type==='invoice.payment_failed') {
      const invoice=event.data.object as Stripe.Invoice;
      const sub=invoice.parent?.subscription_details?.subscription;
      if(invoice.parent?.subscription_details?.metadata?.app==='omiki-sandbox') id=typeof sub==='string'?sub:sub?.id ?? null;
    }
    if(id) await synchronize(stripe,service,id);
    return Response.json({received:true});
  } catch {
    console.error('Stripe webhook processing failed; Stripe should retry.');
    return new Response('Retry later',{status:500});
  }
});
