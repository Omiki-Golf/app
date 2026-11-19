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

const MADRID = 'Europe/Madrid';
const madridDay = (time: number) => Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: MADRID, year: 'numeric', month: '2-digit', day: '2-digit' }).format(time));

/**
 * Días naturales (hora de Madrid) hasta el día en que vence el Weekend: 0 = vence hoy.
 * El Weekend vence a las 23:59 h de ese día; null si ya ha vencido o no hay fecha.
 */
export function weekendDaysLeft(until?: string | null, now = Date.now()): number | null {
  const end = until ? Date.parse(until) : Number.NaN;
  if (!Number.isFinite(end) || end <= now) return null;
  return Math.round((madridDay(end) - madridDay(now)) / DAY);
}

/** «hoy», «mañana» o «el 25 de noviembre», siempre seguido de «a las 23:59 h». */
export function weekendExpiryText(until?: string | null, now = Date.now()): string | null {
  const days = weekendDaysLeft(until, now);
  if (days === null) return null;
  const day = days === 0 ? 'hoy' : days === 1 ? 'mañana'
    : `el ${new Date(Date.parse(until!)).toLocaleDateString('es-ES', { timeZone: MADRID, day: 'numeric', month: 'long' })}`;
  return `${day} a las 23:59 h`;
}

/** Versión corta para etiquetas: «hoy», «mañana» o «23/11»; null si ya ha vencido o no hay fecha. */
export function weekendExpiryShort(until?: string | null, now = Date.now()): string | null {
  const days = weekendDaysLeft(until, now);
  if (days === null) return null;
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  return new Date(Date.parse(until!)).toLocaleDateString('es-ES', { timeZone: MADRID, day: '2-digit', month: '2-digit' });
}

/** Último tramo de un Weekend de 3 meses: queda una semana o menos. */
export const weekendLastWeek = (until?: string | null, weekendDays?: number | null, now = Date.now()) => {
  const days = weekendDaysLeft(until, now);
  return days !== null && days <= 7 && weekendDays === 90;
};

/** Días naturales (hora de Madrid) que faltan hasta una fecha futura: 0 = hoy. Sirve para cualquier vencimiento. */
export const calendarDaysLeft = weekendDaysLeft;
