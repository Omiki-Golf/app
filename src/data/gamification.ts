export const GAMIFICATION_PRODUCTS = [
  { id: 'no-paso-rojas', name: 'No paso de Rojas', short: 'Rojas', tone: 'red' },
  { id: 'spanish-hand', name: 'Spanish Hand', short: 'SH', tone: 'emerald' },
  { id: 'buceador', name: 'Buceador', short: 'Agua', tone: 'blue' },
  { id: 'minero', name: 'Minero', short: 'Búnker', tone: 'amber' },
  { id: 'lumberjack', name: 'Lumberjack', short: 'Árbol', tone: 'green' },
  { id: 'maestro-obstaculos', name: 'Maestro de Obstáculos', short: 'Salvada', tone: 'purple' },
  { id: 'fenomeno-tee', name: 'Fenómeno del Tee', short: 'Drive', tone: 'cyan' },
  { id: 'abrelatas', name: 'Abrelatas', short: 'Perdida', tone: 'orange' },
  { id: 'hada-patos', name: 'Hada de los Patos', short: 'Patos', tone: 'pink' },
] as const;

export type GamificationId = typeof GAMIFICATION_PRODUCTS[number]['id'];
export const EXTRA_GAMIFICATION_PRODUCTS = GAMIFICATION_PRODUCTS.filter(item => item.id !== 'no-paso-rojas' && item.id !== 'spanish-hand');
export const gamificationProduct = (id: string) => GAMIFICATION_PRODUCTS.find(item => item.id === id);
