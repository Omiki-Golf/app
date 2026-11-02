// Rankings de grupo justos: un total absoluto premia a quien más ha jugado. El promedio por partida
// (total ÷ partidas jugadas) nivela esa diferencia: 10 «No pasó de rojas» en 28 partidas pesan menos que 10 en 20.

export type RankingMode = 'fair' | 'absolute';

export interface FairRankingEntry {
  key: string;
  name: string;
  total: number;
  rounds: number;
  /** Total ÷ partidas; null si no constan partidas. */
  average: number | null;
  handicap: number | null;
}

export interface FairRankingSource {
  player_name: string;
  player_id?: string | null;
  total_rounds?: number | null;
  avg_handicap?: number | null;
  handicap?: number | null;
  player_handicap?: number | null;
}

export const toFairEntries = <T extends FairRankingSource>(rows: T[], getValue: (row: T) => number | null | undefined): FairRankingEntry[] =>
  rows.map((row, index) => {
    const total = Number(getValue(row) ?? 0);
    const rounds = Number(row.total_rounds ?? 0);
    return {
      key: row.player_id || `${row.player_name}-${index}`,
      name: row.player_name,
      total,
      rounds,
      average: rounds > 0 ? total / rounds : null,
      handicap: row.avg_handicap ?? row.handicap ?? row.player_handicap ?? null,
    };
  });

/**
 * Ordena por promedio por partida (justa) o por total (absoluta). Con lowerIsBetter gana el valor más bajo
 * (p. ej. «Driver de Oro»). Desempates: la otra medida, más partidas jugadas y menor hándicap.
 */
export const sortRanking = (entries: FairRankingEntry[], mode: RankingMode, lowerIsBetter = false): FairRankingEntry[] => {
  const direction = lowerIsBetter ? 1 : -1;
  const metric = (entry: FairRankingEntry, which: RankingMode) => which === 'fair' ? entry.average : entry.total;
  const compareBy = (a: FairRankingEntry, b: FairRankingEntry, which: RankingMode) => {
    const left = metric(a, which);
    const right = metric(b, which);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    return (left - right) * direction;
  };
  return [...entries].sort((a, b) =>
    compareBy(a, b, mode)
    || compareBy(a, b, mode === 'fair' ? 'absolute' : 'fair')
    || b.rounds - a.rounds
    || (a.handicap ?? Infinity) - (b.handicap ?? Infinity)
    || a.name.localeCompare(b.name));
};

/** Los dos campeones de una tarjeta: el del total absoluto y el del promedio por partida. */
export const awardChampions = (entries: FairRankingEntry[], lowerIsBetter = false) => ({
  absolute: sortRanking(entries, 'absolute', lowerIsBetter)[0] ?? null,
  fair: sortRanking(entries, 'fair', lowerIsBetter)[0] ?? null,
});

const averageFormat = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatAverage = (value: number | null) => value === null ? '—' : averageFormat.format(value);
