export type HomeGroupAccess = 'owner' | 'admin' | 'member';

/**
 * Grupos de Inicio en tres bloques, cada uno del más antiguo al más reciente:
 * - owned: creados por ti (fecha de creación);
 * - admin: los que administras (fecha en que te nombraron administrador);
 * - member: de los que eres miembro (fecha en que aceptaste la invitación).
 */
export function homeGroupSections<T extends { access: HomeGroupAccess; since?: string | null; name: string }>(groups: T[]) {
  const time = (value?: string | null) => (value ? Date.parse(value) : Number.POSITIVE_INFINITY);
  const sorted = (access: HomeGroupAccess) => groups
    .filter(group => group.access === access)
    .sort((a, b) => time(a.since) - time(b.since) || a.name.localeCompare(b.name, 'es'));
  return { owned: sorted('owner'), admin: sorted('admin'), member: sorted('member') };
}

/**
 * Mismo orden que Inicio, en una sola lista: Tus grupos (creados, no Weekend), Administras,
 * Tus Weekends y Eres miembro; dentro de cada bloque, del más antiguo al más reciente.
 * Los grupos archivados van al final, con el mismo criterio entre ellos.
 */
export function homeGroupOrder<T extends { access: HomeGroupAccess; since?: string | null; name?: string | null; group_type?: string | null; archived_at?: string | null }>(groups: T[]) {
  const time = (value?: string | null) => (value ? Date.parse(value) : Number.POSITIVE_INFINITY);
  const block = (group: T) => group.access === 'owner' ? (group.group_type === 'weekend' ? 2 : 0) : group.access === 'admin' ? 1 : 3;
  return [...groups].sort((a, b) =>
    Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at))
    || block(a) - block(b)
    || time(a.since) - time(b.since)
    || (a.name ?? '').localeCompare(b.name ?? '', 'es'));
}
