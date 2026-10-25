import { checkedStripe, serviceClient } from '../_shared/stripe.ts';
import { allowedOrigin } from '../_shared/stripe-domain.ts';
import { rateLimit } from '../_shared/admin.ts';

// Baja inmediata de la cuenta que hace la petición:
// 1) cancela la suscripción de Stripe para que no siga cobrando,
// 2) anonimiza sus datos y traspasa sus grupos (delete_account_data),
// 3) borra la cuenta de acceso.
const CONFIRMATION = 'ELIMINAR CUENTA';

Deno.serve(async req => {
  const origin = req.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
  if (!allowedOrigin(origin)) return reply({ error: 'Origen no permitido.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido.' }, 405);

  let stage = 'authentication';
  try {
    const service = serviceClient();
    const token = req.headers.get('Authorization')?.replace(/^Bearer /i, '') || '';
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return reply({ error: 'Inicia sesión para darte de baja.' }, 401);

    stage = 'request';
    const raw = await req.text();
    if (raw.length > 512) return reply({ error: 'Solicitud demasiado grande.' }, 413);
    const input = JSON.parse(raw || '{}');
    if (input.confirm !== CONFIRMATION) return reply({ error: `Escribe ${CONFIRMATION} para confirmar la baja.` }, 400);

    stage = 'rate-limit';
    await rateLimit(service, `delete-account:${user.id}`, 5, 3600);

    stage = 'permissions';
    const { data: admin, error: adminError } = await service.from('app_administrators').select('user_id').eq('user_id', user.id).maybeSingle();
    if (adminError) throw new Error('No se pudieron comprobar los permisos.');
    if (admin) return reply({ error: 'Las cuentas de administración no pueden darse de baja desde la app.' }, 403);

    stage = 'subscription';
    const { data: subscriptions, error: subscriptionError } = await service
      .from('user_subscriptions').select('stripe_subscription_id, status').eq('user_id', user.id);
    if (subscriptionError) throw new Error('No se pudo comprobar la suscripción.');
    const active = (subscriptions || []).filter(row => row.stripe_subscription_id && !['canceled', 'incomplete_expired'].includes(row.status));
    if (active.length > 0) {
      // Si no se puede cancelar el cobro, no se borra nada.
      const stripe = await checkedStripe();
      for (const row of active) {
        const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        if (!['canceled', 'incomplete_expired'].includes(subscription.status)) await stripe.subscriptions.cancel(subscription.id);
      }
    }

    stage = 'anonymize';
    const { data: summary, error: anonymizeError } = await service.rpc('delete_account_data', { p_user: user.id });
    if (anonymizeError) throw new Error(anonymizeError.message);

    stage = 'auth';
    const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    return reply({ ok: true, ...(summary || {}) });
  } catch (error) {
    console.error('delete-account', stage, error);
    return reply({ error: 'No se pudo completar la baja. Inténtalo de nuevo o escríbenos a hola@omikigolf.com.', stage }, 500);
  }
});
