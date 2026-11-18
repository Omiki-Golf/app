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
