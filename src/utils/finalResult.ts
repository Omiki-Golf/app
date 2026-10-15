import type { DecidedResult, GameMode, RoundPlayer, RoundScore } from '../types';

export type FinalResultMode = Exclude<GameMode, 'stableford'>;

export interface FinalStanding {
  position: number;
  label: string;
  points: number;
  handicap: number;
}

export interface FinalResult {
  mode: FinalResultMode;
  winnerLabel: string;
  resultText: string;
  decidedByHandicap: boolean;
  standings: FinalStanding[];
}

const sumModePoints = (scores: Record<number, RoundScore> | undefined) =>
  Object.values(scores || {}).reduce((sum, score) => sum + (score.mode_points || 0), 0);

const byPointsThenHandicap = (a: { points: number; handicap: number }, b: { points: number; handicap: number }) =>
  b.points - a.points || a.handicap - b.handicap;

/**
 * El modal de "partida decidida" solo tiene sentido si quedaban hoyos por jugar.
 * Si la partida se resuelve en el último hoyo se muestra únicamente el resultado final.
 */
export const isDecidedBeforeLastHole = (decidedResult: DecidedResult | null | undefined) =>
  !!decidedResult && decidedResult.holes_remaining > 0;

export const calculateFinalResult = (
  mode: GameMode,
  players: RoundPlayer[],
  scoresByPlayer: Record<string, Record<number, RoundScore> | undefined>,
): FinalResult | null => {
  if (mode === 'stableford') return null;

  if (mode === 'parejas') {
    if (players.length !== 4) return null;
    // Ambos miembros de la pareja reciben los mismos puntos por hoyo: se cuenta uno por pareja.
    const teams = [players.slice(0, 2), players.slice(2, 4)].map((members) => ({
      label: members.map((player) => player.name).join(' / '),
      points: sumModePoints(scoresByPlayer[members[0].id]),
      handicap: members.reduce((sum, player) => sum + player.playing_handicap, 0),
    })).sort(byPointsThenHandicap);
    const [winner, loser] = teams;
    const margin = winner.points - loser.points;
    return {
      mode,
      winnerLabel: winner.label,
      resultText: margin > 0 ? `${margin} UP` : 'Empate a puntos',
      decidedByHandicap: margin === 0,
      standings: teams.map((team, index) => ({ position: index + 1, ...team })),
    };
  }

  const expectedPlayers = mode === 'match' ? 2 : 3;
  if (players.length !== expectedPlayers) return null;

  const ranking = players.map((player) => ({
    label: player.name,
    points: sumModePoints(scoresByPlayer[player.id]),
    handicap: player.playing_handicap,
  })).sort(byPointsThenHandicap);
  const [winner, runnerUp] = ranking;
  const margin = winner.points - runnerUp.points;

  return {
    mode,
    winnerLabel: winner.label,
    resultText: mode === 'match'
      ? (margin > 0 ? `${margin} UP` : 'Empate a puntos')
      : `${winner.points} puntos`,
    decidedByHandicap: margin === 0,
    standings: ranking.map((entry, index) => ({ position: index + 1, ...entry })),
  };
};
