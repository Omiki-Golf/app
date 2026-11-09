import { Axe, Beer, Bird, CircleDashed, Hand, Pickaxe, Rocket, ShieldCheck, Waves, type LucideIcon } from 'lucide-react';

/**
 * Catálogo de gamificación del Pro-Shop. Cada título tiene su icono y su ficha
 * (`badge`: fondo + tinta) para mostrarse igual que Spanish Hands en tarjetas,
 * clasificaciones y estadísticas. Las clases son literales para que Tailwind las genere.
 */
export const GAMIFICATION_PRODUCTS = [
  { id: 'no-paso-rojas', name: 'No paso de Rojas', short: 'Rojas', icon: Beer, badge: 'bg-red-600 text-white' },
  { id: 'spanish-hand', name: 'Spanish Hand', short: 'SH', icon: Hand, badge: 'bg-accent text-on-accent' },
  { id: 'buceador', name: 'Buceador', short: 'Agua', icon: Waves, badge: 'bg-blue-600 text-white' },
  { id: 'minero', name: 'Minero', short: 'Búnker', icon: Pickaxe, badge: 'bg-amber-500 text-amber-950' },
  { id: 'lumberjack', name: 'Lumberjack', short: 'Árbol', icon: Axe, badge: 'bg-green-700 text-white' },
  { id: 'maestro-obstaculos', name: 'Maestro de Obstáculos', short: 'Salvada', icon: ShieldCheck, badge: 'bg-purple-600 text-white' },
  { id: 'fenomeno-tee', name: 'Fenómeno del Tee', short: 'Drive', icon: Rocket, badge: 'bg-cyan-500 text-cyan-950' },
  { id: 'abrelatas', name: 'Abrelatas', short: 'Perdida', icon: CircleDashed, badge: 'bg-orange-500 text-orange-950' },
  { id: 'hada-patos', name: 'Hada de los Patos', short: 'Patos', icon: Bird, badge: 'bg-pink-500 text-white' },
] as const satisfies ReadonlyArray<{ id: string; name: string; short: string; icon: LucideIcon; badge: string }>;

export type GamificationId = typeof GAMIFICATION_PRODUCTS[number]['id'];
export type GamificationProduct = typeof GAMIFICATION_PRODUCTS[number];
export const EXTRA_GAMIFICATION_PRODUCTS = GAMIFICATION_PRODUCTS.filter(item => item.id !== 'no-paso-rojas' && item.id !== 'spanish-hand');
export const gamificationProduct = (id: string): GamificationProduct | undefined => GAMIFICATION_PRODUCTS.find(item => item.id === id);
/** Títulos extra (no Rojas ni Spanish Hand) activos en el grupo, en el orden del catálogo. */
export const enabledExtraProducts = (enabled: readonly string[] | null | undefined) =>
  EXTRA_GAMIFICATION_PRODUCTS.filter(item => enabled?.includes(item.id));
