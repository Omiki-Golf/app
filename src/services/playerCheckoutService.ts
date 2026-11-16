import { supabase } from './supabaseClient';
import { getReadOnly } from './userRestriction';
import { userService } from './userService';
import { intentPlan, playerIntent, type SimulatedSubscription } from '../utils/playerRegistration';

class UncertainCheckoutError extends Error {}

async function callCheckout(action: 'create' | 'status') {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { action } });
  if (error) {
    let message = 'No se ha podido conectar con Stripe Sandbox. Reintenta.';
    // Sin respuesta (red caída o tiempo agotado) no sabemos si el servidor llegó a
    // completar la operación en Stripe: se marca para comprobarlo antes de avisar.
    if (!(error.context instanceof Response)) throw new UncertainCheckoutError(message);
    try { message = (await error.context.json()).error || message; } catch { /* Respuesta sin JSON. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as { url?: string; ok?: boolean };
}

export const playerCheckoutService = {
  async load(expectedUserId: string) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user || user.id !== expectedUserId || !user.email_confirmed_at) throw new Error('Confirma tu correo e inicia sesión para continuar.');
    const intent = playerIntent(user.user_metadata);
    if (!intent) throw new Error('Esta cuenta no tiene un registro de plan pendiente.');
    const readOnly = await getReadOnly();
    const profile = readOnly ? await userService.getProfile(user.id) : await userService.ensureProfileFromMetadata(user.id, user.user_metadata);
    if (!profile) throw new Error('No se ha podido recuperar tu perfil. Reintenta para continuar.');
    const read = async () => {
      const { data, error } = await supabase.from('user_subscriptions').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return data as (SimulatedSubscription & { stripe_intent_id?: string; stripe_subscription_id?: string }) | null;
    };
    const subscription = await read();
    const completed = !!subscription?.stripe_subscription_id && subscription.stripe_intent_id === intent.id && subscription.plan_type === intentPlan(intent) && subscription.status === 'active' && new Date(subscription.current_period_end).getTime() > Date.now();
    const ranks: Record<string, number> = { player: 1, team: 2, premium: 3 };
    const isUpgrade = !!subscription?.stripe_subscription_id && subscription.status === 'active'
      && (ranks[intentPlan(intent)] ?? 0) > (ranks[subscription.plan_type] ?? 0)
      && (!subscription.current_period_end || Date.parse(subscription.current_period_end) > Date.now());
    const existingPaidPlan = !!subscription && !isUpgrade && (!!subscription.stripe_subscription_id || (subscription.status === 'active' && ['player','team','premium'].includes(subscription.plan_type) && (!subscription.current_period_end || Date.parse(subscription.current_period_end) > Date.now())));
    return { user, intent, profile, subscription, completed, readOnly, existingPaidPlan, isUpgrade };
  },
  async activate(expectedUserId: string) {
    const state = await this.load(expectedUserId);
    if (state.readOnly) throw new Error('Esta cuenta tiene permisos de solo lectura.');
    let result: Awaited<ReturnType<typeof callCheckout>>;
    try { result = await callCheckout('create'); }
    catch (cause) {
      // Una mejora pudo aplicarse aunque la respuesta no llegara: comprobarlo una vez.
      if (cause instanceof UncertainCheckoutError) {
        const after = await this.refresh(expectedUserId).catch(() => null);
        if (after?.completed) return after;
      }
      throw cause;
    }
    if (result.url) {
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Stripe devolvió una dirección de pago no válida.');
      window.location.assign(url.href);
      return 'redirecting' as const;
    }
    return this.load(expectedUserId);
  },
  async refresh(expectedUserId: string) {
    const state = await this.load(expectedUserId);
    if (!state.readOnly) await callCheckout('status');
    return this.load(expectedUserId);
  },
  async acknowledge(expectedUserId: string) {
    const state = await this.load(expectedUserId);
    if (!state.completed) throw new Error('La activación no está confirmada.');
    if (!state.readOnly) {
      const { error } = await supabase.auth.updateUser({ data: { player_checkout_acknowledged: state.intent.id } });
      if (error) throw error;
    }
  },
};
