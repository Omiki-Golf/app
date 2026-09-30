import { supabase } from './supabaseClient';
import { getReadOnly } from './userRestriction';
import { userService } from './userService';
import { intentPlan, playerIntent, type SimulatedSubscription } from '../utils/playerRegistration';

async function callCheckout(action: 'create' | 'status') {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { action } });
  if (error) {
    let message = 'No se ha podido conectar con Stripe Sandbox. Reintenta.';
    try { message = (await error.context.json()).error || message; } catch { /* Network failure. */ }
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
    const existingPaidPlan = !!subscription && (!!subscription.stripe_subscription_id || (subscription.status === 'active' && ['player','team','premium'].includes(subscription.plan_type) && (!subscription.current_period_end || Date.parse(subscription.current_period_end) > Date.now())));
    return { user, intent, profile, subscription, completed, readOnly, existingPaidPlan };
  },
  async activate(expectedUserId: string) {
    const state = await this.load(expectedUserId);
    if (state.readOnly) throw new Error('Esta cuenta tiene permisos de solo lectura.');
    const result = await callCheckout('create');
    if (result.url) {
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Stripe devolvió una dirección de pago no válida.');
      window.location.assign(url.href);
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
