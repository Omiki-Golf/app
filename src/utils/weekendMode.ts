const DAY = 86_400_000;

/**
 * Duración del Weekend contratado (7 días o 3 meses), o null si no está activo.
 * No se guarda aparte: activate_weekend_for_testing fija updated_at al activar, así que la
 * diferencia con weekend_mode_until da la duración. Si falta ese dato, se deduce de lo que queda.
 */
export function weekendDuration(until?: string | null, activatedAt?: string | null, now = Date.now()): 7 | 90 | null {
  const end = until ? Date.parse(until) : Number.NaN;
  if (!Number.isFinite(end) || end <= now) return null;
  const start = activatedAt ? Date.parse(activatedAt) : Number.NaN;
  const days = Number.isFinite(start) && start < end ? (end - start) / DAY : (end - now) / DAY;
  return days > 8 ? 90 : 7;
}
