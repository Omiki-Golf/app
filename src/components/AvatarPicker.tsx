import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AVATAR_FAMILIES, AVATAR_OPTIONS, getAvatarFamily, type AvatarFamily } from '../utils/avatarOptions';

interface AvatarPickerProps {
  value: string;
  onSelect: (url: string) => void;
  /** Separación entre avatares de la rejilla (clase de Tailwind). */
  gapClassName?: string;
}

const FAMILY_LABEL_KEYS: Record<AvatarFamily, string> = {
  personas: 'auth.avatarFamilies.personas',
  animales: 'auth.avatarFamilies.animales',
  robots: 'auth.avatarFamilies.robots',
};

export default function AvatarPicker({ value, onSelect, gapClassName = 'gap-3' }: AvatarPickerProps) {
  const { t } = useTranslation();
  const [family, setFamily] = useState<AvatarFamily>(() => getAvatarFamily(value) ?? 'personas');
  const avatars = AVATAR_OPTIONS.filter((avatar) => avatar.family === family);

  return (
    <div>
      <div role="tablist" aria-label={t('auth.avatar')} className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-line p-1">
        {AVATAR_FAMILIES.map((option) => {
          const selected = option === family;
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFamily(option)}
              className={`rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                selected ? 'bg-accent text-white shadow-sm' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {t(FAMILY_LABEL_KEYS[option])}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className={`grid grid-cols-5 ${gapClassName}`}>
        {avatars.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            onClick={() => onSelect(avatar.url)}
            className={`aspect-square rounded-full overflow-hidden border-2 transition-all ${
              value === avatar.url ? 'border-accent ring-2 ring-accent-ring' : 'border-line'
            }`}
            aria-label={t('auth.selectAvatar', { name: avatar.name })}
            aria-pressed={value === avatar.url}
            title={avatar.name}
          >
            <img src={avatar.url} alt="" loading="lazy" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
