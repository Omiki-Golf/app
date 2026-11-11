// La regla vive en el dominio de Stripe para que la app y el servidor no diverjan.
export { teamTrialOffer, teamTrialOfferActive } from '../../supabase/functions/_shared/team-trial-offer';

/** Precio de Team anual el primer año con la oferta de fin de prueba. */
export const TEAM_TRIAL_OFFER_PRICE = 29.99;
