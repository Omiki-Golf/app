import type { DecidedResult, GameMode } from '../types';

// Estadísticas acumuladas de un jugador registrado sobre las partidas rápidas de su cuenta.

export interface CareerRound {
  id: string;
  created_at: string;
  game_mode?: GameMode | null;
  num_holes: number;
  course_id: string;
  decided_result?: DecidedResult | null;
}

export interface CareerPlayer {
  id: string;
  round_id: string;
  user_id?: string | null;
  name: string;
  playing_handicap: number;
  created_at?: string;
}

export interface CareerScore {
  round_id: string;
  player_id: string;
  gross_strokes: number;
  stableford_points: number;
  mode_points?: number | null;
  no_paso_rojas?: boolean;
  spanish_hands?: boolean;
  abandoned?: boolean;
}

export interface CareerAccount {
  userId: string;
  nick: string;
  displayName?: string | null;
}

export interface CareerRoundSummary {
  roundId: string;
  date: string;
  courseName: string;
  mode: GameMode;
  holes: number;
  points: number;
  won: boolean;
}

export interface CareerStats {
  roundsPlayed: number;
  /** Partidas de la cuenta en las que no se ha podido identificar al jugador. */
  roundsUnidentified: number;
  wins: number;
  holesPlayed: number;
  /** Media de puntos Stableford escalada a 18 hoyos. */
  stablefordPer18: number | null;
  grossPerHole: number | null;
  bestRound: CareerRoundSummary | null;
  distribution: { eagleOrBetter: number; birdie: number; par: number; bogey: number; doubleOrWorse: number };
  holeInOnes: number;
  noPasoRojas: number;
  spanishHands: number;
  byMode: Record<GameMode, number>;
  topCourses: Array<{ name: string; rounds: number }>;
  recent: CareerRoundSummary[];
}

const normalize = (value: string | null | undefined) =>
  (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Vinculado a la cuenta o, en partidas antiguas, único jugador con el nick o el nombre. */
export const findAccountPlayer = (players: CareerPlayer[], account: CareerAccount): CareerPlayer | null => {
  const linked = players.find(player => player.user_id === account.userId);
  if (linked) return linked;
  const names = [account.nick, account.displayName].map(normalize).filter(Boolean);
  const byName = players.filter(player => names.includes(normalize(player.name)));
  return byName.length === 1 ? byName[0] : null;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Gana quien suma más (puntos de la modalidad o Stableford); empate: hándicap más bajo. */
const roundWinners = (round: CareerRound, players: CareerPlayer[], scores: CareerScore[]): Set<string> => {
  if (round.decided_result?.winner_player_ids?.length) return new Set(round.decided_result.winner_player_ids);
  const mode = round.game_mode ?? 'stableford';
  const pointsOf = (playerId: string) => sum(scores
    .filter(score => score.player_id === playerId && !score.abandoned)
    .map(score => mode === 'stableford' ? score.stableford_points : (score.mode_points ?? 0)));
  const ordered = [...players].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));

  if (mode === 'parejas' && ordered.length === 4) {
    const teams = [ordered.slice(0, 2), ordered.slice(2, 4)].map(members => ({
      members,
      points: pointsOf(members[0].id),
      handicap: members[0].playing_handicap + members[1].playing_handicap,
    })).sort((a, b) => b.points - a.points || a.handicap - b.handicap);
    return new Set(teams[0].members.map(member => member.id));
  }

  const ranking = ordered.map(player => ({ player, points: pointsOf(player.id) }))
    .sort((a, b) => b.points - a.points || a.player.playing_handicap - b.player.playing_handicap);
  return new Set(ranking[0] ? [ranking[0].player.id] : []);
};

export const computeCareerStats = (
  account: CareerAccount,
  rounds: CareerRound[],
  players: CareerPlayer[],
  scores: CareerScore[],
  courseNames: Record<string, string>,
): CareerStats => {
  const byMode: Record<GameMode, number> = { stableford: 0, match: 0, sindicato: 0, parejas: 0 };
  const distribution = { eagleOrBetter: 0, birdie: 0, par: 0, bogey: 0, doubleOrWorse: 0 };
  const courseCount = new Map<string, number>();
  const summaries: CareerRoundSummary[] = [];
  let unidentified = 0;
  let holeInOnes = 0;
  let noPasoRojas = 0;
  let spanishHands = 0;
  let grossTotal = 0;
  let holesPlayed = 0;
  let pointsTotal = 0;

  for (const round of rounds) {
    const roundPlayers = players.filter(player => player.round_id === round.id);
    const me = findAccountPlayer(roundPlayers, account);
    if (!me) { unidentified += 1; continue; }

    const roundScores = scores.filter(score => score.round_id === round.id);
    const mine = roundScores.filter(score => score.player_id === me.id && !score.abandoned && score.gross_strokes > 0);
    const mode = round.game_mode ?? 'stableford';
    const points = sum(mine.map(score => score.stableford_points));
    const courseName = courseNames[round.course_id] ?? 'Campo';

    byMode[mode] += 1;
    courseCount.set(courseName, (courseCount.get(courseName) ?? 0) + 1);
    holesPlayed += mine.length;
    pointsTotal += points;
    grossTotal += sum(mine.map(score => score.gross_strokes));
    for (const score of mine) {
      if (score.gross_strokes === 1) holeInOnes += 1;
      if (score.stableford_points >= 4) distribution.eagleOrBetter += 1;
      else if (score.stableford_points === 3) distribution.birdie += 1;
      else if (score.stableford_points === 2) distribution.par += 1;
      else if (score.stableford_points === 1) distribution.bogey += 1;
      else distribution.doubleOrWorse += 1;
    }
    noPasoRojas += roundScores.filter(score => score.player_id === me.id && score.no_paso_rojas).length;
    spanishHands += roundScores.filter(score => score.player_id === me.id && score.spanish_hands).length;

    summaries.push({
      roundId: round.id,
      date: round.created_at,
      courseName,
      mode,
      holes: mine.length,
      points,
      won: roundWinners(round, roundPlayers, roundScores).has(me.id),
    });
  }

  const recent = [...summaries].sort((a, b) => b.date.localeCompare(a.date));
  // La mejor partida se compara por puntos por hoyo, para no mezclar 9 y 18 hoyos.
  const bestRound = summaries.filter(summary => summary.holes > 0)
    .sort((a, b) => b.points / b.holes - a.points / a.holes || b.points - a.points)[0] ?? null;

  return {
    roundsPlayed: summaries.length,
    roundsUnidentified: unidentified,
    wins: summaries.filter(summary => summary.won).length,
    holesPlayed,
    stablefordPer18: holesPlayed ? Math.round((pointsTotal / holesPlayed) * 18 * 10) / 10 : null,
    grossPerHole: holesPlayed ? Math.round((grossTotal / holesPlayed) * 100) / 100 : null,
    bestRound,
    distribution,
    holeInOnes,
    noPasoRojas,
    spanishHands,
    byMode,
    topCourses: [...courseCount.entries()]
      .map(([name, count]) => ({ name, rounds: count }))
      .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name))
      .slice(0, 3),
    recent: recent.slice(0, 5),
  };
};
