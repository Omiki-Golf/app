/** Datos mínimos de un grupo propio activo (no archivado) para calcular la capacidad. */
export type OwnedGroupLite = {
  group_type?: string | null;
  weekend_mode_until?: string | null;
  /** Duración del Weekend que creó el grupo: 7 días o 90 (3 meses). */
  weekend_days?: number | null;
  premium_branding?: boolean | null;
};

export type WeekendDays = 7 | 90;
export type NewGroupKind = 'weekend7' | 'weekend90' | 'team' | 'premium';

/** Grupo incluido en Team/Premium + hasta 2 Grupos Adicionales. */
export const MAX_PLAN_GROUPS = 3;
export const MAX_ADDITIONAL_GROUPS = MAX_PLAN_GROUPS - 1;

const isFuture = (value?: string | null, now = Date.now()) => Boolean(value && Date.parse(value) > now);

export const weekendKindDays = (kind?: NewGroupKind | null): WeekendDays | null =>
  kind === 'weekend7' ? 7 : kind === 'weekend90' ? 90 : null;

/** Duración de un grupo Weekend; los grupos sin dato son de antes de existir el de 3 meses. */
export const groupWeekendDays = (group: OwnedGroupLite): WeekendDays => (group.weekend_days === 90 ? 90 : 7);

/** Grupo creado con un Weekend que todavía está vigente (de la duración indicada, si se pasa). */
export const isActiveWeekendGroup = (group: OwnedGroupLite, days?: WeekendDays, now = Date.now()) =>
  group.group_type === 'weekend' && isFuture(group.weekend_mode_until, now)
  && (days === undefined || groupWeekendDays(group) === days);

/** Plazas de grupo del plan: el incluido más los Grupos Adicionales comprados, con un máximo de 3. */
export const planGroupCapacity = (extraGroups: number) => Math.min(MAX_PLAN_GROUPS, 1 + Math.max(0, extraGroups));

/**
 * Qué grupo puede crear ahora el usuario, o null si ninguno.
 * - Cada Weekend (7 días y 3 meses) da su propio grupo aparte, aunque ya existan los del plan.
 * - Team/Premium incluye un grupo y hasta 2 más con "Grupo adicional" del Pro-Shop.
 *   Los grupos Weekend no consumen esa capacidad.
 */
export function nextGroupKind({ ownedGroups, extraGroups, weekend7Until, weekend90Until, hasTeamPlan, hasPremiumPlan = false, now = Date.now() }: {
  ownedGroups: OwnedGroupLite[];
  extraGroups: number;
  weekend7Until?: string | null;
  weekend90Until?: string | null;
  hasTeamPlan: boolean;
  hasPremiumPlan?: boolean;
  now?: number;
}): NewGroupKind | null {
  if (isFuture(weekend7Until, now) && !ownedGroups.some(group => isActiveWeekendGroup(group, 7, now))) return 'weekend7';
  if (isFuture(weekend90Until, now) && !ownedGroups.some(group => isActiveWeekendGroup(group, 90, now))) return 'weekend90';
  const planGroups = ownedGroups.filter(group => group.group_type !== 'weekend');
  if (hasTeamPlan && planGroups.length < planGroupCapacity(extraGroups)) {
    // Premium solo aporta un grupo rosa. Las plazas compradas con Grupo Adicional son Teams verdes.
    return hasPremiumPlan && !planGroups.some(group => group.premium_branding) ? 'premium' : 'team';
  }
  return null;
}

/**
 * Cómo puede pasar a Team un grupo Weekend de 3 meses:
 * - free: queda una plaza libre (el grupo incluido aún no existe o hay un adicional sin usar).
 * - additional: ocupa un Grupo Adicional nuevo (tiene 1 o 2 grupos del plan, todos ocupados).
 * - full: ya tiene sus 3 grupos del plan.
 * - not-team: no tiene un plan Team/Premium pagado.
 */
export function weekendConversion({ ownedGroups, extraGroups, hasPaidTeamPlan }: {
  ownedGroups: OwnedGroupLite[];
  extraGroups: number;
  hasPaidTeamPlan: boolean;
}): 'free' | 'additional' | 'full' | 'not-team' {
  if (!hasPaidTeamPlan) return 'not-team';
  const planGroups = ownedGroups.filter(group => group.group_type !== 'weekend').length;
  if (planGroups >= MAX_PLAN_GROUPS) return 'full';
  return planGroups < planGroupCapacity(extraGroups) ? 'free' : 'additional';
}
