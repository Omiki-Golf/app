// Colores de cada resultado de hoyo, los mismos que en la tarjeta de puntuación:
// Eagle amarillo, Birdie rojo, Par blanco, Bogey azul, Doble o peor negro.
// Tonos con texto legible (≥ 4,5:1) y un borde fino para que el blanco y el negro se vean
// tanto en modo claro como en oscuro.
export type ScoreResult = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';

/** Resultado a partir de los puntos Stableford netos del hoyo (como en la tarjeta). */
export const scoreResultFromPoints = (points: number | null | undefined, abandoned?: boolean): ScoreResult => {
  if (abandoned || !points || points <= 0) return 'double';
  if (points === 1) return 'bogey';
  if (points === 2) return 'par';
  if (points === 3) return 'birdie';
  return 'eagle';
};

/** Círculo con el número de golpes. */
export const scoreResultChip: Record<ScoreResult, string> = {
  eagle: 'bg-yellow-400 text-yellow-950 ring-yellow-600',
  birdie: 'bg-red-600 text-white ring-red-800',
  par: 'bg-white text-slate-900 ring-slate-400',
  bogey: 'bg-blue-600 text-white ring-blue-800',
  double: 'bg-black text-white ring-slate-500',
};

/** Relleno de barras (Mis estadísticas). */
export const scoreResultBar: Record<ScoreResult, string> = {
  eagle: 'bg-yellow-400',
  birdie: 'bg-red-600',
  par: 'bg-white ring-1 ring-inset ring-slate-400',
  bogey: 'bg-blue-600',
  double: 'bg-black ring-1 ring-inset ring-slate-500',
};

export const scoreResultLabel: Record<ScoreResult, string> = {
  eagle: 'Eagle o mejor',
  birdie: 'Birdie',
  par: 'Par',
  bogey: 'Bogey',
  double: 'Doble o peor',
};
