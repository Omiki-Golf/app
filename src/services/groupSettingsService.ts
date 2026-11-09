import { supabase } from './supabaseClient';
import { GAMIFICATION_PRODUCTS } from '../data/gamification';

/** Evento que avisa a tarjeta, estadísticas y panel de que cambió la gamificación de un grupo. */
export const GAMIFICATION_UPDATED_EVENT = 'group-gamification-updated';
export const notifyGamificationUpdated = (groupId: string) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GAMIFICATION_UPDATED_EVENT, { detail: { groupId } }));
};

export type HandicapVariationMode = 'mitad' | 'primero_ultimo';

export interface GroupSettings {
  min_rounds_for_awards: number;
  handicap_variation_mode: HandicapVariationMode;
}

export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  min_rounds_for_awards: 0,
  handicap_variation_mode: 'mitad',
};

const getLocalSettings = (groupId: string): GroupSettings | null => {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(`group_settings_${groupId}`) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        min_rounds_for_awards: typeof parsed.min_rounds_for_awards === 'number' && parsed.min_rounds_for_awards >= 0
          ? Math.floor(parsed.min_rounds_for_awards)
          : DEFAULT_GROUP_SETTINGS.min_rounds_for_awards,
        handicap_variation_mode: parsed.handicap_variation_mode === 'primero_ultimo' ? 'primero_ultimo' : 'mitad',
      };
    }
  } catch {}
  return null;
};

export const groupSettingsService = {
  /** Títulos contratados del grupo, en el orden del catálogo. `null` si no se han podido leer. */
  async getGamification(groupId: string): Promise<Array<{ product_id: string; enabled: boolean }> | null> {
    const { data, error } = await supabase.from('group_gamification').select('product_id, enabled').eq('group_id', groupId).eq('purchased', true);
    if (error) {
      console.warn('No se ha podido leer la gamificación del grupo:', error);
      return null;
    }
    const order = GAMIFICATION_PRODUCTS.map(item => item.id as string);
    return (data || [])
      .filter(item => order.includes(item.product_id))
      .sort((a, b) => order.indexOf(a.product_id) - order.indexOf(b.product_id));
  },

  /** Títulos contratados y activos. `null` si no se han podido leer (se usa el comportamiento clásico). */
  async getEnabledGamification(groupId: string): Promise<string[] | null> {
    const products = await this.getGamification(groupId);
    return products ? products.filter(item => item.enabled).map(item => item.product_id) : null;
  },

  async saveGamification(groupId: string, products: Array<{ product_id: string; enabled: boolean }>): Promise<void> {
    if (!products.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Inicia sesión para guardar la gamificación.');
    // update (no upsert): el panel solo activa o desactiva lo ya contratado en el Pro-Shop.
    for (const item of products) {
      const { error } = await supabase.from('group_gamification')
        .update({ enabled: item.enabled, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq('group_id', groupId).eq('product_id', item.product_id).eq('purchased', true);
      if (error) throw error;
    }
    notifyGamificationUpdated(groupId);
  },
  async getGroupSettings(groupId: string): Promise<GroupSettings> {
    const local = getLocalSettings(groupId);

    try {
      const { data, error } = await supabase
        .from('groups')
        .select('min_rounds_for_awards, handicap_variation_mode')
        .eq('id', groupId)
        .maybeSingle();

      if (!error && data) {
        const remoteSettings: GroupSettings = {
          min_rounds_for_awards: typeof (data as any).min_rounds_for_awards === 'number'
            ? Math.floor((data as any).min_rounds_for_awards)
            : (local?.min_rounds_for_awards ?? DEFAULT_GROUP_SETTINGS.min_rounds_for_awards),
          handicap_variation_mode: (data as any).handicap_variation_mode === 'primero_ultimo'
            ? 'primero_ultimo'
            : (local?.handicap_variation_mode ?? DEFAULT_GROUP_SETTINGS.handicap_variation_mode),
        };
        try {
          window.localStorage?.setItem(`group_settings_${groupId}`, JSON.stringify(remoteSettings));
        } catch {}
        return remoteSettings;
      }
    } catch {}

    return local ?? { ...DEFAULT_GROUP_SETTINGS };
  },

  async saveGroupSettings(groupId: string, settings: GroupSettings): Promise<void> {
    const sanitized: GroupSettings = {
      min_rounds_for_awards: Math.max(0, Math.floor(Number(settings.min_rounds_for_awards) || 0)),
      handicap_variation_mode: settings.handicap_variation_mode === 'primero_ultimo' ? 'primero_ultimo' : 'mitad',
    };

    try {
      window.localStorage?.setItem(`group_settings_${groupId}`, JSON.stringify(sanitized));
    } catch {}

    try {
      await supabase
        .from('groups')
        .update({
          min_rounds_for_awards: sanitized.min_rounds_for_awards,
          handicap_variation_mode: sanitized.handicap_variation_mode,
        })
        .eq('id', groupId);
    } catch (err) {
      // Column may not exist remotely yet until migration is applied; local storage persists
      console.warn('Remote group settings update deferred:', err);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('group_settings_updated', { detail: { groupId, settings: sanitized } }));
    }
  },
};
