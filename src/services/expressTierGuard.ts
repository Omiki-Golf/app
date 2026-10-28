const DEVICE_UUID_KEY = 'par_tee_device_uuid';
const LOCAL_COUNT_KEY = 'par_tee_express_count';
export const MAX_EXPRESS_GAMES = 4;

export interface TierInfo {
  id: number;
  name: string;
  description: string;
  recommended?: boolean;
}

export const UPGRADE_TIERS: TierInfo[] = [
  { id: 2, name: 'Par Tee Player', description: 'Para jugadores habituales. Historial en la nube y estadísticas avanzadas.' },
  { id: 3, name: 'Par Tee Team', description: 'Para jugar con amigos y grupos. Multijugador y clasificaciones de grupo.' },
  { id: 4, name: 'Par Tee Team - Premium', description: 'Experiencia completa sin límites, torneos y todos los modos de juego.', recommended: true },
];

export const expressTierGuard = {
  // Obtiene o genera un ID único e inmutable para este teléfono/dispositivo
  getDeviceId(): string {
    let uuid = localStorage.getItem(DEVICE_UUID_KEY);
    if (!uuid) {
      uuid = 'dev_' + crypto.randomUUID();
      localStorage.setItem(DEVICE_UUID_KEY, uuid);
    }
    return uuid;
  },

  // Consulta el número de partidas consumidas
  getPlayedCount(): number {
    const count = localStorage.getItem(LOCAL_COUNT_KEY);
    return count ? parseInt(count, 10) : 0;
  },

  // Partidas restantes
  getRemainingGames(): number {
    return Math.max(0, MAX_EXPRESS_GAMES - this.getPlayedCount());
  },

  // Verifica si el dispositivo aún puede crear partidas
  canCreateGame(): boolean {
    return this.getPlayedCount() < MAX_EXPRESS_GAMES;
  },

  // Incrementa el contador (vínculalo también con tu backend pasando getDeviceId())
  consumeGame(): number {
    const nextCount = this.getPlayedCount() + 1;
    localStorage.setItem(LOCAL_COUNT_KEY, nextCount.toString());
    return nextCount;
  }
};

// En src/services/expressTierGuard.ts (al final del archivo)

export const trackExpressGameCreated = (roundId: string) => {
  const LOCAL_COUNT_KEY = 'par_tee_express_count';
  const LOCAL_HISTORY_KEY = 'par_tee_express_history';

  // 1. Obtener el contador actual y sumar 1
  const currentCount = parseInt(localStorage.getItem(LOCAL_COUNT_KEY) || '0', 10);
  const newCount = currentCount + 1;
  localStorage.setItem(LOCAL_COUNT_KEY, newCount.toString());

  // 2. Acumular el historial de IDs de partidas creadas
  const historyRaw = localStorage.getItem(LOCAL_HISTORY_KEY);
  const history: string[] = historyRaw ? JSON.parse(historyRaw) : [];
  history.push(roundId);
  localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(history));

  // 3. Imprimir por consola para verificación
  console.log('🎮 Partida Express registrada en localStorage:');
  console.log(`   - Total acumulado: ${newCount}`);
  console.log(`   - ID de partida creada: ${roundId}`);
  console.log(`   - Historial en LocalStorage:`, history);

  return newCount;
};

// Por ejemplo, en tu expressTierGuard.ts o utils
export const TIER_LIMITS = {
  EXPRESS: 4,     // Par Tee Express (Tier-1)
  UNLIMITED: undefined // Resto de Tiers (Premium, Club, etc.)
};