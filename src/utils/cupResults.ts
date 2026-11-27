export interface CupResult {
  winner: string;
  score: string;
  decisiveHole?: number;
}

export interface CupTie {
  id: string;
  players: [string | null, string | null];
  bestOf: 1 | 3;
  results: CupResult[];
  next?: { id: string; slot: 0 | 1 };
  thirdPlace?: { id: string; slot: 0 | 1 };
  started: boolean;
}

export function cupWinner(tie: CupTie): string | null {
  const needed = tie.bestOf === 1 ? 1 : 2;
  return tie.players.find(player =>
    player !== null && tie.results.filter(result => result.winner === player).length === needed
  ) ?? null;
}

// The caller records a correction in the audit log in the same transaction as this update.
export function recordCupResult(
  bracket: readonly CupTie[],
  tieId: string,
  game: number,
  result: CupResult,
  canCorrect: boolean,
): CupTie[] {
  const tie = bracket.find(entry => entry.id === tieId);
  if (!tie || !tie.players.every(Boolean) || !tie.players.includes(result.winner)) {
    throw new Error('El ganador debe pertenecer a un cruce con dos jugadores.');
  }
  if (!Number.isInteger(game) || game < 1 || game > tie.bestOf || game > tie.results.length + 1) {
    throw new Error('Número de partido no válido.');
  }
  if (!result.score.trim() || (result.decisiveHole !== undefined &&
    (!Number.isInteger(result.decisiveHole) || result.decisiveHole < 19))) {
    throw new Error('Marcador o hoyo de desempate no válido.');
  }

  const correcting = game <= tie.results.length;
  const previousWinner = cupWinner(tie);
  const next = tie.next;
  const downstream = next && bracket.find(entry => entry.id === next.id);
  const thirdPlace = tie.thirdPlace;
  const bronze = thirdPlace && bracket.find(entry => entry.id === thirdPlace.id);
  if (next && !downstream) throw new Error('Falta el siguiente cruce.');
  if (thirdPlace && !bronze) throw new Error('Falta el cruce por el tercer puesto.');
  if (correcting && (!canCorrect || downstream?.started || downstream?.results.length ||
    bronze?.started || bronze?.results.length)) {
    throw new Error('No se puede corregir este resultado.');
  }
  if (!correcting && previousWinner) throw new Error('La eliminatoria ya está resuelta.');

  const results = [...tie.results];
  results[game - 1] = { ...result };
  const updated = { ...tie, started: true, results };
  if (results.some((_, index) => index < results.length - 1 &&
    cupWinner({ ...updated, results: results.slice(0, index + 1) }))) {
    throw new Error('La corrección dejaría un partido registrado después de decidir la serie.');
  }
  const winner = cupWinner(updated);
  return bracket.map(entry => {
    if (entry === tie) return updated;
    const destination = entry === downstream ? next : entry === bronze ? thirdPlace : undefined;
    if (!destination || winner === previousWinner) return entry;
    const players: CupTie['players'] = [...entry.players];
    players[destination.slot] = entry === bronze && winner
      ? tie.players.find(player => player !== winner) ?? null
      : winner;
    return { ...entry, players };
  });
}
