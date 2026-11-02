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
  hole_number?: number;
  gross_strokes: number;
  net_strokes?: number | null;
  strokes_received?: number | null;
  stableford_points: number;
  mode_points?: number | null;
  no_paso_rojas?: boolean;
  spanish_hands?: boolean;
  abandoned?: boolean;
}

/** Par de cada hoyo del campo, para distinguir dobles de triples. */
export interface CareerHole {
  course_id: string;
  hole_number: number;
  par: number;
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
  /** Hoyos de la partida (9 o 18), aunque alguno no se jugara. */
  numHoles: number;
  points: number;
  won: boolean;
  /** Puesto en la partida (1 = ganador) y número de jugadores. */
  position: number;
  totalPlayers: number;
  /** HCP de juego de la partida en escala de 18 hoyos (en 9 hoyos, el doble). */
  handicap18: number;
}

export interface CareerResultDistribution {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double: number;
  triplePlus: number;
}

export interface CareerHoleMoment {
  points: number;
  holeNumber: number;
  grossStrokes: number;
  courseName: string;
  date: string;
}

export interface CareerCoursePerformance {
  courseName: string;
  numHoles: number;
  rounds: number;
  best: number;
  worst: number;
  average: number;
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
  /** Veces que se ha quedado 1.º, 2.º, 3.º y 4.º. */
  podiums: [number, number, number, number];
  /** Puntos Stableford medios por partida, por separado en 9 y 18 hoyos. */
  stableford9: { rounds: number; average: number | null };
  stableford18: { rounds: number; average: number | null };
  /** Partidas de la más antigua a la más reciente, para las tendencias. */
  trend: CareerRoundSummary[];
  /** Cada campo, por separado en 9 y 18 hoyos, de más a menos jugado. */
  courses: CareerCoursePerformance[];
  bestCourse: CareerCoursePerformance | null;
  worstCourse: CareerCoursePerformance | null;
  mostPlayedCourse: { name: string; rounds: number } | null;
  /** Resultado neto de cada hoyo contra su par; la bola levantada cuenta como doble bogey. */
  results: CareerResultDistribution;
  resultHoles: number;
  birdiesPerRound: number | null;
  parsPerRound: number | null;
  bogeysPlusPerRound: number | null;
  /** Birdies o mejor por cada bogey o peor. */
  birdieBogeyRatio: number | null;
  worstRound: CareerRoundSummary | null;
  bestHole: CareerHoleMoment | null;
  worstHole: CareerHoleMoment | null;
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
const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Puesto de cada jugador: gana quien suma más (puntos de la modalidad o Stableford); empate: hándicap más bajo.
 * Una decisión congelada (decided_result) pone primero a sus ganadores. En Parejas, la pareja comparte puesto.
 */
const roundPositions = (round: CareerRound, players: CareerPlayer[], scores: CareerScore[]): Map<string, number> => {
  const decided = new Set(round.decided_result?.winner_player_ids ?? []);
  const isDecided = (id: string) => (decided.has(id) ? 1 : 0);
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
      decided: isDecided(members[0].id) + isDecided(members[1].id),
    })).sort((a, b) => b.decided - a.decided || b.points - a.points || a.handicap - b.handicap);
    return new Map(teams.flatMap((team, index) => team.members.map(member => [member.id, index + 1] as [string, number])));
  }

  const ranking = ordered.map(player => ({ player, points: pointsOf(player.id) }))
    .sort((a, b) => isDecided(b.player.id) - isDecided(a.player.id) || b.points - a.points || a.player.playing_handicap - b.player.playing_handicap);
  return new Map(ranking.map((entry, index) => [entry.player.id, index + 1]));
};

export const computeCareerStats = (
  account: CareerAccount,
  rounds: CareerRound[],
  players: CareerPlayer[],
  scores: CareerScore[],
  courseNames: Record<string, string>,
  holes: CareerHole[] = [],
): CareerStats => {
  const byMode: Record<GameMode, number> = { stableford: 0, match: 0, sindicato: 0, parejas: 0 };
  const distribution = { eagleOrBetter: 0, birdie: 0, par: 0, bogey: 0, doubleOrWorse: 0 };
  const results: CareerResultDistribution = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triplePlus: 0 };
  const podiums: [number, number, number, number] = [0, 0, 0, 0];
  const courseCount = new Map<string, number>();
  const summaries: CareerRoundSummary[] = [];
  const holeMoments: Array<CareerHoleMoment & { overPar: number | null }> = [];
  let unidentified = 0;
  let holeInOnes = 0;
  let noPasoRojas = 0;
  let spanishHands = 0;
  let grossTotal = 0;
  let holesPlayed = 0;
  let pointsTotal = 0;

  // Un campo de 9 hoyos jugado a 18 repite sus hoyos: el 10 es el 1, el 11 el 2…
  const parOf = (courseId: string, holeNumber?: number) => {
    if (!holeNumber) return null;
    const courseHoles = holes.filter(hole => hole.course_id === courseId);
    const hole = courseHoles.find(item => item.hole_number === holeNumber)
      ?? (holeNumber > 9 ? courseHoles.find(item => item.hole_number === holeNumber - 9) : undefined);
    return hole?.par ?? null;
  };

  for (const round of rounds) {
    const roundPlayers = players.filter(player => player.round_id === round.id);
    const me = findAccountPlayer(roundPlayers, account);
    if (!me) { unidentified += 1; continue; }

    const roundScores = scores.filter(score => score.round_id === round.id);
    const mine = roundScores.filter(score => score.player_id === me.id && !score.abandoned && score.gross_strokes > 0);
    const mode = round.game_mode ?? 'stableford';
    const points = sum(mine.map(score => score.stableford_points));
    const courseName = courseNames[round.course_id] ?? 'Campo';
    const position = roundPositions(round, roundPlayers, roundScores).get(me.id) ?? 0;

    byMode[mode] += 1;
    courseCount.set(courseName, (courseCount.get(courseName) ?? 0) + 1);
    holesPlayed += mine.length;
    pointsTotal += points;
    grossTotal += sum(mine.map(score => score.gross_strokes));
    if (position >= 1 && position <= 4) podiums[position - 1] += 1;
    for (const score of mine) {
      if (score.gross_strokes === 1) holeInOnes += 1;
      if (score.stableford_points >= 4) distribution.eagleOrBetter += 1;
      else if (score.stableford_points === 3) distribution.birdie += 1;
      else if (score.stableford_points === 2) distribution.par += 1;
      else if (score.stableford_points === 1) distribution.bogey += 1;
      else distribution.doubleOrWorse += 1;
    }

    // Resultado neto contra el par, como en Mis partidas. Sin par conocido se deduce de los puntos
    // (con 0 puntos no se distingue el triple del doble y cuenta como doble).
    for (const score of roundScores.filter(item => item.player_id === me.id && (item.abandoned || item.gross_strokes > 0))) {
      if (score.abandoned) { results.double += 1; continue; }
      const par = parOf(round.course_id, score.hole_number);
      const net = score.net_strokes ?? score.gross_strokes - (score.strokes_received ?? 0);
      const overPar = par === null ? null : net - par;
      if (overPar === null) {
        const pointsResult = score.stableford_points;
        if (pointsResult >= 4) results.eagle += 1;
        else if (pointsResult === 3) results.birdie += 1;
        else if (pointsResult === 2) results.par += 1;
        else if (pointsResult === 1) results.bogey += 1;
        else results.double += 1;
      } else if (overPar <= -2) results.eagle += 1;
      else if (overPar === -1) results.birdie += 1;
      else if (overPar === 0) results.par += 1;
      else if (overPar === 1) results.bogey += 1;
      else if (overPar === 2) results.double += 1;
      else results.triplePlus += 1;
      if (score.hole_number) {
        holeMoments.push({ points: score.stableford_points, holeNumber: score.hole_number, grossStrokes: score.gross_strokes, courseName, date: round.created_at, overPar });
      }
    }
    noPasoRojas += roundScores.filter(score => score.player_id === me.id && score.no_paso_rojas).length;
    spanishHands += roundScores.filter(score => score.player_id === me.id && score.spanish_hands).length;

    summaries.push({
      roundId: round.id,
      date: round.created_at,
      courseName,
      mode,
      holes: mine.length,
      numHoles: round.num_holes,
      points,
      won: position === 1,
      position,
      totalPlayers: roundPlayers.length,
      handicap18: round.num_holes === 9 ? me.playing_handicap * 2 : me.playing_handicap,
    });
  }

  const recent = [...summaries].sort((a, b) => b.date.localeCompare(a.date));
  // La mejor y la peor partida se comparan por puntos por hoyo, para no mezclar 9 y 18 hoyos.
  const played = summaries.filter(summary => summary.holes > 0);
  const byPointsPerHole = [...played].sort((a, b) => b.points / b.holes - a.points / a.holes || b.points - a.points || b.date.localeCompare(a.date));
  const bestRound = byPointsPerHole[0] ?? null;
  const worstRound = byPointsPerHole.length > 1 ? byPointsPerHole[byPointsPerHole.length - 1] : null;

  const average = (values: number[]) => values.length ? round1(sum(values) / values.length) : null;
  const sized = (numHoles: number) => summaries.filter(summary => summary.numHoles === numHoles);

  const courseGroups = new Map<string, CareerRoundSummary[]>();
  for (const summary of summaries) {
    const key = `${summary.courseName}\u0000${summary.numHoles}`;
    courseGroups.set(key, [...(courseGroups.get(key) ?? []), summary]);
  }
  const courses = [...courseGroups.values()].map((group): CareerCoursePerformance => ({
    courseName: group[0].courseName,
    numHoles: group[0].numHoles,
    rounds: group.length,
    best: Math.max(...group.map(item => item.points)),
    worst: Math.min(...group.map(item => item.points)),
    average: round1(sum(group.map(item => item.points)) / group.length),
  })).sort((a, b) => b.rounds - a.rounds || b.average / b.numHoles - a.average / a.numHoles || a.courseName.localeCompare(b.courseName));
  // Para elegir campo se compara la media por hoyo y, si los hay, solo campos jugados al menos dos veces.
  const comparable = courses.filter(course => course.rounds >= 2).length >= 2 ? courses.filter(course => course.rounds >= 2) : courses;
  const byAverage = [...comparable].sort((a, b) => b.average / b.numHoles - a.average / a.numHoles || b.rounds - a.rounds);
  const topCourses = [...courseCount.entries()]
    .map(([name, count]) => ({ name, rounds: count }))
    .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name));

  const roundsPlayed = summaries.length;
  const resultHoles = sum(Object.values(results));
  const bogeysPlus = results.bogey + results.double + results.triplePlus;
  const perRound = (value: number) => roundsPlayed ? round1(value / roundsPlayed) : null;
  const latestFirst = (a: CareerHoleMoment, b: CareerHoleMoment) => b.date.localeCompare(a.date);
  const bestHole = [...holeMoments].sort((a, b) => b.points - a.points || latestFirst(a, b))[0] ?? null;
  const worstHole = [...holeMoments].sort((a, b) => a.points - b.points || (b.overPar ?? 0) - (a.overPar ?? 0) || latestFirst(a, b))[0] ?? null;
  const toMoment = (moment: (typeof holeMoments)[number] | null): CareerHoleMoment | null =>
    moment ? { points: moment.points, holeNumber: moment.holeNumber, grossStrokes: moment.grossStrokes, courseName: moment.courseName, date: moment.date } : null;

  return {
    roundsPlayed,
    roundsUnidentified: unidentified,
    wins: podiums[0],
    holesPlayed,
    stablefordPer18: holesPlayed ? round1((pointsTotal / holesPlayed) * 18) : null,
    grossPerHole: holesPlayed ? round2(grossTotal / holesPlayed) : null,
    bestRound,
    distribution,
    holeInOnes,
    noPasoRojas,
    spanishHands,
    byMode,
    topCourses: topCourses.slice(0, 3),
    recent: recent.slice(0, 5),
    podiums,
    stableford9: { rounds: sized(9).length, average: average(sized(9).map(item => item.points)) },
    stableford18: { rounds: sized(18).length, average: average(sized(18).map(item => item.points)) },
    trend: [...summaries].sort((a, b) => a.date.localeCompare(b.date)),
    courses,
    bestCourse: byAverage[0] ?? null,
    worstCourse: byAverage.length > 1 ? byAverage[byAverage.length - 1] : null,
    mostPlayedCourse: topCourses[0] ?? null,
    results,
    resultHoles,
    birdiesPerRound: perRound(results.birdie),
    parsPerRound: perRound(results.par),
    bogeysPlusPerRound: perRound(bogeysPlus),
    birdieBogeyRatio: bogeysPlus ? round2((results.eagle + results.birdie) / bogeysPlus) : null,
    worstRound,
    bestHole: toMoment(bestHole),
    worstHole: toMoment(worstHole),
  };
};
