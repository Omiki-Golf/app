import { calendarDaysLeft } from './weekendMode';

/** Días de antelación del aviso de vencimiento: 15 en las anuales y 3 en las mensuales. */
export const RENEWAL_NOTICE_DAYS = { annual: 15, monthly: 3 } as const;

export type RenewalNotice = { plan: 'player' | 'team' | 'premium'; endsAt: string; daysLeft: number; annual: boolean };

/**
 * Aviso de vencimiento de una suscripción de pago en Stripe, o null si no toca mostrarlo.
 * No aplica a la prueba Team ni a Weekend, que tienen su propio aviso. «Continúa con nosotros»
 * lo descarta para ese vencimiento (dismissedFor = current_period_end); al renovar vuelve a avisar.
 */
export function renewalNotice(subscription: {
  plan_type: string;
  status: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  stripe_subscription_id?: string | null;
} | null | undefined, dismissedFor?: unknown, now = Date.now()): RenewalNotice | null {
  if (!subscription?.stripe_subscription_id || subscription.status !== 'active') return null;
  const plan = subscription.plan_type;
  if (plan !== 'player' && plan !== 'team' && plan !== 'premium') return null;
  const end = subscription.current_period_end;
  if (!end || dismissedFor === end) return null;
  const daysLeft = calendarDaysLeft(end, now);
  if (daysLeft === null) return null;
  const start = subscription.current_period_start ? Date.parse(subscription.current_period_start) : Number.NaN;
  const annual = Number.isFinite(start) && Date.parse(end) - start > 60 * 86_400_000;
  if (daysLeft > (annual ? RENEWAL_NOTICE_DAYS.annual : RENEWAL_NOTICE_DAYS.monthly)) return null;
  return { plan, endsAt: end, daysLeft, annual };
}
