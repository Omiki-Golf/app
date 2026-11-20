/** Cómo varía el hándicap de juego tras una partida de grupo (ajuste «Variación de HCP»). */
export type HandicapVariationMode = 'mitad' | 'primero_ultimo';

export const normalizeHandicapVariationMode = (value: unknown): HandicapVariationMode =>
  value === 'primero_ultimo' ? 'primero_ultimo' : 'mitad';

/**
 * Ajuste base (-1 baja, 0 igual, +1 sube) del jugador en la posición `index` (0 = ganador)
 * de una clasificación de `totalPlayers` miembros, ya ordenada.
 * - `primero_ultimo`: solo baja el ganador y solo sube el último; los demás no cambian.
 * - `mitad`: baja la mitad de arriba y sube la de abajo; con impares, el de enmedio no cambia.
 */
export function baseHandicapAdjustment(index: number, totalPlayers: number, mode: HandicapVariationMode): -1 | 0 | 1 {
  if (totalPlayers < 2 || index < 0 || index >= totalPlayers) return 0;

  if (mode === 'primero_ultimo') {
    if (index === 0) return -1;
    if (index === totalPlayers - 1) return 1;
    return 0;
  }

  const half = Math.floor(totalPlayers / 2);
  if (index < half) return -1;
  if (totalPlayers % 2 === 1 && index === half) return 0;
  return 1;
}
