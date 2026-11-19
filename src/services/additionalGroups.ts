import { supabase } from './supabaseClient';

/** Grupo Adicional de la cuenta: un hueco anual ligado al grupo que lo ocupa. */
export type AdditionalGroupSlot = {
  id: string;
  group_id: string | null;
  expires_at: string;
  renew: boolean;
};

/** Precio anual del Grupo Adicional (IVA incluido). */
export const ADDITIONAL_GROUP_PRICE = 24.99;
/** Días de antelación del aviso de renovación del Grupo Adicional. */
export const ADDITIONAL_GROUP_NOTICE_DAYS = 15;

/** Grupos Adicionales vigentes del usuario, del que vence antes al que vence después. */
export async function loadAdditionalGroupSlots(userId: string): Promise<AdditionalGroupSlot[]> {
  const { data, error } = await supabase
    .from('additional_group_slots')
    .select('id, group_id, expires_at, renew')
    .eq('owner_id', userId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true });
  if (error) throw error;
  return (data || []) as AdditionalGroupSlot[];
}

/** «Renovar» (true) o «No renovar» (false) un Grupo Adicional. */
export async function setAdditionalGroupRenewal(slotId: string, renew: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_additional_group_renewal', { p_slot: slotId, p_renew: renew });
  if (error) throw error;
}

/** Grupos Adicionales que vencen en los próximos 15 días (o menos). */
export function additionalGroupNotices(slots: AdditionalGroupSlot[], now = Date.now()): AdditionalGroupSlot[] {
  const limit = now + ADDITIONAL_GROUP_NOTICE_DAYS * 86_400_000;
  return slots.filter(slot => {
    const end = Date.parse(slot.expires_at);
    return Number.isFinite(end) && end > now && end <= limit;
  });
}

/** Fecha corta en hora de Madrid: «05/12/2027». */
export const additionalGroupDate = (value: string) =>
  new Date(Date.parse(value)).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' });
