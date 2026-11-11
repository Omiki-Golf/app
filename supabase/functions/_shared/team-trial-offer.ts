// Oferta de fin de prueba Team: del día 25 al 30 de la prueba, Team anual con 10 € de descuento
// en la primera factura (39,99 € → 29,99 € el primer año). El cupón lo crea stripe-setup.
export const teamTrialOffer = { coupon: 'omiki_team_trial_offer_v1', amountOff: 1000, daysBeforeEnd: 6 } as const;
export function teamTrialOfferActive(
  subscription: { plan_type?: string | null; status?: string | null; team_trial_ends_at?: string | null } | null | undefined,
  now = Date.now(),
) {
  const end = subscription?.team_trial_ends_at ? Date.parse(subscription.team_trial_ends_at) : Number.NaN;
  return subscription?.plan_type === 'player' && subscription.status === 'active' && Number.isFinite(end)
    && now < end && now >= end - teamTrialOffer.daysBeforeEnd * 86_400_000;
}
