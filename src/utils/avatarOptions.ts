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
  animal('leon', 'El León'),
  animal('tigre', 'El Tigre'),
  animal('panda', 'El Panda'),
  animal('oso', 'El Oso'),
  animal('lobo', 'El Lobo'),
  animal('zorro', 'El Zorro'),
  animal('coneja', 'La Coneja'),
  animal('jirafa', 'La Jirafa'),
  animal('erizo', 'El Erizo'),
  animal('ardilla', 'La Ardilla'),
  animal('koala', 'El Koala'),
  animal('elefante', 'El Elefante'),
  animal('pato', 'El Pato'),
  animal('bulldog', 'El Bulldog'),
  animal('rinoceronte', 'El Rinoceronte'),
  person('pelirroja', 'La Pelirroja'),
  person('barbudo', 'El Barbudo'),
  person('rubia', 'La Rubia'),
  person('abuelo', 'El Abuelo'),
  person('rizos', 'La Rizos'),
  person('rapado', 'El Rapado'),
  person('gafitas', 'La Gafitas'),
  person('capitan', 'El Capitán'),
  person('peliazul', 'La Peliazul'),
  person('tupe', 'El Tupé'),
  person('abuela', 'La Abuela'),
  person('moreno', 'El Moreno'),
  person('trenzas', 'La Trenzas'),
  person('rubio', 'El Rubio'),
  person('melenas', 'El Melenas'),
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
