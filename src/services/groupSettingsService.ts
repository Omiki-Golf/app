import { supabase } from './supabaseClient';

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
