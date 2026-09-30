export const sandboxAccount = 'acct_1UIWPn3OErhJmu5v';
export const prices = {
  player: { monthly: 299, annual: 2899 },
  team: { monthly: 599, annual: 5799 },
  premium: { monthly: 799, annual: 7699 },
} as const;
export type Plan = keyof typeof prices;
export type Period = 'monthly' | 'annual';
export function checkoutIntent(metadata: Record<string, unknown>) {
  const value = metadata.player_checkout as {id?: string; plan?: string; period?: string} | undefined;
  const plan = value?.plan ?? 'player';
  if (!value?.id || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.id) ||
      !Object.hasOwn(prices, plan) || !['monthly','annual'].includes(value.period ?? '')) throw new Error('Registro de plan no válido.');
  return { id: value.id, plan: plan as Plan, period: value.period as Period };
}
export function allowedOrigin(origin: string) {
  return ['http://localhost:5173','http://127.0.0.1:5173','https://golf.arinsaldev.com'].includes(origin);
}
export function subscriptionStatus(status: string, invoicePaid: boolean) {
  return status === 'active' && invoicePaid ? 'active' : status === 'canceled' ? 'cancelled' : 'expired';
}
