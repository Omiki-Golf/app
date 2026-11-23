import type { DisplayPlan } from '../data/planCatalog';

// Mismos ids que planCatalog (tipado: si el catálogo cambia, TypeScript avisa).
const PLAN_IDS: readonly DisplayPlan[] = ['express', 'player', 'team', 'premium', 'weekend'];

export interface PlanLink {
  plan: DisplayPlan;
  annual: boolean;
}

/**
 * Enlace directo a la pantalla de planes desde la web pública:
 * `https://app.omikigolf.com/?plan=player&period=annual` (period: annual | monthly; por defecto anual).
 * Devuelve null si el enlace no nombra un plan conocido.
 */
export function readPlanLink(search: string): PlanLink | null {
  const params = new URLSearchParams(search);
  const plan = params.get('plan')?.trim().toLowerCase();
  if (!plan || !PLAN_IDS.includes(plan as DisplayPlan)) return null;
  return { plan: plan as DisplayPlan, annual: params.get('period')?.trim().toLowerCase() !== 'monthly' };
}

/** Quita `plan` y `period` de la barra de direcciones para que no se repita al recargar. */
export function clearPlanLink(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('plan') && !url.searchParams.has('period')) return;
  url.searchParams.delete('plan');
  url.searchParams.delete('period');
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
}
