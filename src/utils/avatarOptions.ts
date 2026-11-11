export type AvatarFamily = 'personas' | 'animales' | 'robots';

export interface AvatarOption {
  id: string;
  name: string;
  url: string;
  family: AvatarFamily;
}

/** Orden en que se muestran las pestañas del selector de avatar. */
export const AVATAR_FAMILIES: AvatarFamily[] = ['personas', 'animales', 'robots'];

const person = (id: string, name: string): AvatarOption => ({ id: `persona-${id}`, name, url: `/avatars/persona-${id}.webp`, family: 'personas' });
const animal = (id: string, name: string): AvatarOption => ({ id, name, url: `/avatars/${id}.webp`, family: 'animales' });
const robot = (id: string, name: string): AvatarOption => ({ id: `robot-${id}`, name, url: `/avatars/robot-${id}.webp`, family: 'robots' });

export const AVATAR_OPTIONS: AvatarOption[] = [
  // Ilustraciones planas de Gemini (noviembre 2026). Los archivos de avatares retirados del
  // selector siguen en public/avatars para no romper el avatar de quien ya los tenía elegidos.
  animal('leon', 'El León'),
  animal('tigre', 'El Tigre'),
  animal('oso', 'El Oso'),
  animal('zorro', 'El Zorro'),
  animal('tejon', 'El Tejón'),
  animal('coneja', 'La Coneja'),
  animal('buho', 'El Búho'),
  animal('lobo', 'El Lobo'),
  animal('panda', 'El Panda'),
  animal('koala', 'El Koala'),
  animal('ciervo', 'El Ciervo'),
  animal('erizo', 'El Erizo'),
  animal('mono', 'El Mono'),
  animal('nutria', 'La Nutria'),
  animal('perro', 'El Perro'),
  person('golfista', 'El Golfista'),
  person('coleta', 'La de la Coleta'),
  person('abuelo', 'El Abuelo'),
  person('gafitas', 'La Gafitas'),
  person('caddie', 'El Caddie'),
  person('estrella', 'La Estrella'),
  person('rizos', 'El Rizos'),
  person('barbudo', 'El Barbudo'),
  person('abuela', 'La Abuela'),
  person('sombrero', 'El del Sombrero'),
  person('trenzas', 'La Trenzas'),
  person('jefa', 'La Jefa'),
  person('capitan', 'El Capitán'),
  person('melena', 'La Melena'),
  person('tupe', 'El Tupé'),
  robot('birdie', 'R-Birdie'),
  robot('eagle', 'Eagle-3000'),
  robot('caddie', 'El Caddie-Bot'),
  robot('hoyo', 'Hoyo-1'),
  robot('tee', 'Tee-Bot'),
  robot('par', 'Par-4'),
  robot('swing', 'Swing-X'),
  robot('green', 'Green-O'),
  robot('albatros', 'Albatros'),
  robot('bogey', 'Bogey'),
  robot('putt', 'Putt-Putt'),
  robot('driver', 'Driver-9'),
  robot('fairway', 'Fairway'),
  robot('chip', 'Chip'),
  robot('bunker', 'Bunker'),
];

export const DEFAULT_AVATAR_URL = '/avatars/leon.webp';

export const getAvatarFamily = (avatarUrl?: string): AvatarFamily | undefined =>
  AVATAR_OPTIONS.find((avatar) => avatar.url === avatarUrl)?.family;

export const normalizeAvatarUrl = (avatarUrl?: string): string => {
  if (!avatarUrl || avatarUrl.includes('api.dicebear.com/')) return DEFAULT_AVATAR_URL;
  return avatarUrl;
};
