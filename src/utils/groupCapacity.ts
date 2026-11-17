/** Datos mínimos de un grupo propio activo (no archivado) para calcular la capacidad. */
export type OwnedGroupLite = { group_type?: string | null; weekend_mode_until?: string | null; premium_branding?: boolean | null };

export type NewGroupKind = 'weekend' | 'team' | 'premium';

const isFuture = (value?: string | null, now = Date.now()) => Boolean(value && Date.parse(value) > now);

/** Grupo creado con un Weekend que todavía está vigente. */
export const isActiveWeekendGroup = (group: OwnedGroupLite, now = Date.now()) =>
  group.group_type === 'weekend' && isFuture(group.weekend_mode_until, now);

/**
 * Qué grupo puede crear ahora el usuario, o null si ninguno.
 * - Weekend es un extra: da un grupo propio aparte, aunque ya exista el del plan.
 * - El plan Team/Premium incluye un grupo, más uno por cada "Grupo adicional" del Pro-Shop.
 *   Los grupos Weekend no consumen esa capacidad.
 */
export function nextGroupKind({ ownedGroups, extraGroups, weekendUntil, hasTeamPlan, hasPremiumPlan = false, now = Date.now() }: {
  ownedGroups: OwnedGroupLite[];
  extraGroups: number;
  weekendUntil?: string | null;
  hasTeamPlan: boolean;
  hasPremiumPlan?: boolean;
  now?: number;
}): NewGroupKind | null {
  if (isFuture(weekendUntil, now) && !ownedGroups.some(group => isActiveWeekendGroup(group, now))) return 'weekend';
  const planGroups = ownedGroups.filter(group => group.group_type !== 'weekend');
  if (hasTeamPlan && planGroups.length < 1 + Math.max(0, extraGroups)) {
    // Premium solo aporta un grupo rosa. Las plazas compradas con Grupo Adicional son Teams verdes.
    return hasPremiumPlan && !planGroups.some(group => group.premium_branding) ? 'premium' : 'team';
  }
  return null;
}
