import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import { AVATAR_FAMILIES, AVATAR_OPTIONS, getAvatarFamily, type AvatarFamily } from '../utils/avatarOptions';
import { isLocalPhoto, isProfilePhotoUrl } from '../utils/profilePhoto';
import { PhotoCropper } from './PhotoCropper';

interface AvatarPickerProps {
  value: string;
  onSelect: (url: string) => void;
  /** Separación entre avatares de la rejilla (clase de Tailwind). */
  gapClassName?: string;
  /** Permite subir una foto propia (el valor pasa a ser la foto recortada como data URL). */
  allowPhoto?: boolean;
}

const FAMILY_LABEL_KEYS: Record<AvatarFamily, string> = {
  personas: 'auth.avatarFamilies.personas',
  animales: 'auth.avatarFamilies.animales',
  robots: 'auth.avatarFamilies.robots',
};

export default function AvatarPicker({ value, onSelect, gapClassName = 'gap-3', allowPhoto = false }: AvatarPickerProps) {
  const { t } = useTranslation();
  const [family, setFamily] = useState<AvatarFamily>(() => getAvatarFamily(value) ?? 'personas');
  const avatars = AVATAR_OPTIONS.filter((avatar) => avatar.family === family);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const isPhoto = isLocalPhoto(value) || isProfilePhotoUrl(value);

  // Libera la imagen original al cerrar el recorte.
  useEffect(() => () => { if (cropSource) URL.revokeObjectURL(cropSource); }, [cropSource]);

  const onFileChosen = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setCropSource(URL.createObjectURL(file));
  };

  return (
    <div>
      {allowPhoto && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-line p-2">
          <span className={`h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 ${isPhoto ? 'border-accent ring-2 ring-accent-ring' : 'border-line bg-card-2'}`}>
            {isPhoto
              ? <img src={value} alt="Tu foto" className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center text-ink-4"><Camera size={22} aria-hidden="true" /></span>}
          </span>
          <div className="min-w-0 flex-1 text-left">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
            >
              <Camera size={16} aria-hidden="true" />
              {isPhoto ? 'Cambiar foto' : 'Subir foto'}
            </button>
            <p className="mt-1 text-xs text-ink-3">{isPhoto ? 'O elige un avatar de abajo para quitarla.' : 'O elige uno de estos avatares.'}</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => { onFileChosen(event.target.files?.[0]); event.target.value = ''; }}
          />
        </div>
      )}
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
      {cropSource && (
        <PhotoCropper
          source={cropSource}
          onCancel={() => setCropSource(null)}
          onCropped={(dataUrl) => { setCropSource(null); onSelect(dataUrl); }}
        />
      )}
    </div>
  );
}
