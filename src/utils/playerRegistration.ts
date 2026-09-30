// Keep the player_checkout metadata key and legacy Player references so pending registrations can resume.
export type BillingPeriod = 'monthly' | 'annual';
export type PaidPlan = 'player' | 'team' | 'premium';
export interface PlayerIntent { id: string; period: BillingPeriod; plan?: PaidPlan }
export const intentPlan = (intent: PlayerIntent): PaidPlan => intent.plan ?? 'player';
export function playerIntent(metadata: Record<string, unknown>): PlayerIntent | null {
  const value = metadata.player_checkout as Partial<PlayerIntent> | undefined;
  return value && typeof value.id === 'string' && /^[0-9a-f-]{36}$/i.test(value.id) &&
    (value.plan === undefined || value.plan === 'player' || value.plan === 'team' || value.plan === 'premium') &&
    (value.period === 'monthly' || value.period === 'annual') ? value as PlayerIntent : null;
}
export function registrationError(fields: { nick: string; email: string; password: string; handicap: string; age: string; over14: boolean; acceptedTerms: boolean }): string | null {
  if (fields.nick.trim().length < 3) return 'El nick debe tener al menos 3 caracteres.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) return 'Introduce un correo válido.';
  if (fields.password.length < 6 || !/[A-Z]/.test(fields.password) || !/[a-z]/.test(fields.password) || !/[^a-zA-Z0-9]/.test(fields.password)) return 'La contraseña debe tener al menos 6 caracteres, mayúscula, minúscula y un carácter especial.';
  if (fields.handicap && !Number.isFinite(Number(fields.handicap))) return 'Introduce un hándicap válido.';
  if (fields.age && (!Number.isInteger(Number(fields.age)) || Number(fields.age) < 14)) return 'La edad debe ser un número entero de al menos 14 años.';
  if (!fields.over14) return 'Debes confirmar que tienes al menos 14 años.';
  if (!fields.acceptedTerms) return 'Debes aceptar los términos y la política de privacidad.';
  return null;
}
export function playerSignupMetadata(intent: PlayerIntent, fields: { nick: string; displayName: string; avatarUrl: string; handicap: string; country: string; postalCode: string; age: string }) {
  return {
    registration_pending: true, player_checkout: intent,
    nick: fields.nick.trim(), display_name: fields.displayName.trim() || null,
    avatar_url: fields.avatarUrl, exact_handicap: fields.handicap ? Number(fields.handicap) : 0,
    default_tee: 'amarillo', country: fields.country.trim(), postal_code: fields.postalCode.trim() || null,
    age: fields.age ? Number(fields.age) : null, accepted_terms: true,
  };
}
export function periodEnd(start: Date, period: BillingPeriod): string {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + (period === 'annual' ? 12 : 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end.toISOString();
}
export interface SimulatedSubscription {
  user_id: string; plan_type: string; status: string; payment_hash: string | null;
  current_period_start: string; current_period_end: string; updated_at: string;
}
export interface CheckoutStore {
  read: () => Promise<SimulatedSubscription | null>;
  insertOnce: (row: SimulatedSubscription) => Promise<void>;
}
export const simulationReference = (userId: string, intent: PlayerIntent) => `${intentPlan(intent)}-simulation:${userId}:${intent.id}:${intent.period}`;
export async function activateSimulation(store: CheckoutStore, userId: string, intent: PlayerIntent, now = new Date()): Promise<SimulatedSubscription> {
  const reference = simulationReference(userId, intent);
  const accept = (row: SimulatedSubscription) => {
    if (row.user_id !== userId || row.payment_hash !== reference || row.plan_type !== intentPlan(intent) || row.status !== 'active' || new Date(row.current_period_end).getTime() <= now.getTime()) throw new Error('La cuenta ya tiene una suscripción distinta o finalizada. No se ha modificado.');
    return row;
  };
  const existing = await store.read();
  if (existing) return accept(existing);
  await store.insertOnce({ user_id: userId, plan_type: intentPlan(intent), status: 'active', payment_hash: reference, current_period_start: now.toISOString(), current_period_end: periodEnd(now, intent.period), updated_at: now.toISOString() });
  const saved = await store.read();
  if (!saved) throw new Error('No se ha podido verificar la activación. Puedes reintentar.');
  return accept(saved);
}
