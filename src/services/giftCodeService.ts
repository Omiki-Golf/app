import { supabase } from './supabaseClient';

// Códigos regalo: 8 caracteres hexadecimales en mayúsculas, de un solo uso.
/** Botón «Probar código» (solo comprueba, no canjea) para las pruebas previas a producción.
 *  Poner a false al pasar a producción con clientes reales. */
export const GIFT_CODE_TEST_BUTTON = true;

export type GiftPlan = 'player' | 'team' | 'weekend';
export type GiftDuration = 'monthly' | 'annual' | '7d' | '90d';
export type GiftCodeStatus = 'available' | 'redeemed' | 'expired' | 'revoked';

export interface GiftCodeInfo { code: string; plan: GiftPlan; duration: GiftDuration; expires_at: string }
export interface GiftCodeRow {
  code: string; plan: GiftPlan; duration: GiftDuration; note: string | null;
  expires_at: string; created_at: string; redeemed_at: string | null; redeemed_nick: string | null;
  revoked_at: string | null; status: GiftCodeStatus;
}

export const GIFT_DURATIONS: Record<GiftPlan, { id: GiftDuration; label: string }[]> = {
  player: [{ id: 'monthly', label: '1 mes' }, { id: 'annual', label: '1 año' }],
  team: [{ id: 'monthly', label: '1 mes' }, { id: 'annual', label: '1 año' }],
  weekend: [{ id: '7d', label: '7 días' }, { id: '90d', label: '3 meses' }],
};
export const GIFT_PLAN_NAMES: Record<GiftPlan, string> = { player: 'Player', team: 'Team', weekend: 'Weekend' };

/** «Omiki Player · 1 año» */
export const giftCodeLabel = (plan: GiftPlan, duration: GiftDuration) =>
  `Omiki ${GIFT_PLAN_NAMES[plan]} · ${GIFT_DURATIONS[plan].find(item => item.id === duration)?.label ?? duration}`;

/** Quita espacios y guiones y pasa a mayúsculas: «ab12 cd34» → «AB12CD34». */
export const normalizeGiftCode = (value: string) => value.replace(/[^0-9a-z]/gi, '').toUpperCase();
export const isGiftCodeFormat = (value: string) => /^[0-9A-F]{8}$/.test(normalizeGiftCode(value));

const message = (error: { message?: string } | null, fallback: string) => error?.message || fallback;

export const giftCodeService = {
  /** Información del código si se puede canjear; null si no existe, está usado, anulado o caducado. */
  async check(code: string): Promise<GiftCodeInfo | null> {
    const { data, error } = await supabase.rpc('check_gift_code', { p_code: normalizeGiftCode(code) });
    if (error) throw new Error(message(error, 'No se ha podido comprobar el código. Reintenta.'));
    return (data as GiftCodeInfo | null) ?? null;
  },
  async redeem(code: string): Promise<{ plan: GiftPlan; duration: GiftDuration; already: boolean }> {
    const { data, error } = await supabase.rpc('redeem_gift_code', { p_code: normalizeGiftCode(code) });
    if (error) throw new Error(message(error, 'No se ha podido canjear el código. Reintenta.'));
    return data;
  },
  async adminCreate(plan: GiftPlan, duration: GiftDuration, count: number, expiresAt: string, note: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('admin_create_gift_codes', { p_plan: plan, p_duration: duration, p_count: count, p_expires_at: expiresAt, p_note: note });
    if (error) throw new Error(message(error, 'No se han podido crear los códigos.'));
    return data as string[];
  },
  async adminList(status: GiftCodeStatus | '' = ''): Promise<GiftCodeRow[]> {
    const { data, error } = await supabase.rpc('admin_list_gift_codes', { p_status: status });
    if (error) throw new Error(message(error, 'No se han podido cargar los códigos.'));
    return (data as GiftCodeRow[]) ?? [];
  },
  async adminRevoke(code: string): Promise<void> {
    const { error } = await supabase.rpc('admin_revoke_gift_code', { p_code: code });
    if (error) throw new Error(message(error, 'No se ha podido anular el código.'));
  },
};
