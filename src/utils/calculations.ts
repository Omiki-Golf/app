const STANDARD_SLOPE = 125;

export const calculatePlayingHandicap = (exactHandicap: number, slope: number = STANDARD_SLOPE): number => {
  return Math.round(exactHandicap * (slope / 113));
};

export const getStrokesReceived = (playingHandicap: number, strokeIndex: number, numHoles: number = 18, holeStrokeIndexes?: number[]): number => {
  if (playingHandicap <= 0) return 0;

  if (numHoles === 9) {
    let normalizedStrokeIndex = strokeIndex;
    if (holeStrokeIndexes && holeStrokeIndexes.length === 9) {
      const sortedIndexes = [...holeStrokeIndexes].sort((a, b) => Number(a) - Number(b));
      normalizedStrokeIndex = sortedIndexes.findIndex(si => Number(si) === Number(strokeIndex)) + 1;

      if (normalizedStrokeIndex === 0) {
        normalizedStrokeIndex = strokeIndex;
      }
    }

    const fullStrokes = Math.floor(playingHandicap / 9);
    const remainder = playingHandicap % 9;
    return normalizedStrokeIndex <= remainder ? fullStrokes + 1 : fullStrokes;
  }

  const fullStrokes = Math.floor(playingHandicap / 18);
  const remainder = playingHandicap % 18;

  if (strokeIndex <= remainder) {
    return fullStrokes + 1;
  }
  return fullStrokes;
};

export const calculateNetStrokes = (grossStrokes: number, strokesReceived: number): number => {
  return grossStrokes - strokesReceived;
};

export const calculateStablefordPoints = (netStrokes: number, par: number): number => {
  const difference = netStrokes - par;

  if (difference >= 2) {
    return 0;
  } else if (difference === 1) {
    return 1;
  } else if (difference === 0) {
    return 2;
  } else if (difference === -1) {
    return 3;
  } else if (difference === -2) {
    return 4;
  } else {
    return 5;
  }
};

export interface CalculatedScore {
  grossStrokes: number;
  strokesReceived: number;
  netStrokes: number;
  stablefordPoints: number;
  no_paso_rojas?: boolean;
  spanish_hands?: boolean;
  gamification_events?: string[];
  abandoned?: boolean;
  mode_points?: number;
}

export const calculateScore = (
  grossStrokes: number,
  playingHandicap: number,
  hole: { par: number; strokeIndex: number },
  numHoles: number = 18,
  allHoles?: Array<{ strokeIndex?: number; stroke_index?: number }>
): CalculatedScore => {
  const allStrokeIndexes = allHoles?.map(h => h.strokeIndex ?? h.stroke_index ?? 0);
  const strokesReceived = getStrokesReceived(playingHandicap, hole.strokeIndex, numHoles, allStrokeIndexes);
  const netStrokes = calculateNetStrokes(grossStrokes, strokesReceived);
  const stablefordPoints = calculateStablefordPoints(netStrokes, hole.par);

  return {
    grossStrokes,
    strokesReceived,
    netStrokes,
    stablefordPoints,
    abandoned: false,
  };
};

export const getTotalStablefordPoints = (scores: Record<number, CalculatedScore>): number => {
  return Object.values(scores).reduce((sum, score) => sum + score.stablefordPoints, 0);
};

export type GameMode = 'stableford' | 'match' | 'sindicato' | 'parejas';

export interface ModeScoreInput {
  playerId: string;
  netStrokes: number;
  abandoned: boolean;
  /** False only when the player has not entered a result for this hole yet. */
  entered?: boolean;
}

const getEnteredModeScores = (allScores: ModeScoreInput[]): ModeScoreInput[] =>
  allScores
    .filter(s => s.entered !== false)
    .map(s => ({ ...s, netStrokes: s.abandoned ? 999 : s.netStrokes }));

export const calculateMatchPoints = (playerId: string, allScores: ModeScoreInput[]): number => {
  const valid = getEnteredModeScores(allScores);
  if (valid.length < 2) return 0;
  const myScore = valid.find(s => s.playerId === playerId);
  if (!myScore) return 0;
  const opp = valid.find(s => s.playerId !== playerId);
  if (!opp) return 0;
  if (myScore.netStrokes < opp.netStrokes) return 1;
  if (myScore.netStrokes === opp.netStrokes) return 0.5;
  return 0;
};

// --- Puntos configurables por partida (Sindicato y Parejas) ---

/** Puntos por puesto en Sindicato: [1º, 2º, 3º]. */
export type SindicatoPoints = [number, number, number];
/** Puntos de Parejas por ganar la comparación de mejor y de peor bola. */
export interface ParejasPoints { best: number; worst: number }
/** Reparto guardado en golf_rounds.mode_points_config. */
export interface ModePointsConfig {
  sindicato?: SindicatoPoints;
  parejas?: ParejasPoints;
}

export const DEFAULT_SINDICATO_POINTS: SindicatoPoints = [6, 4, 2];
export const DEFAULT_PAREJAS_POINTS: ParejasPoints = { best: 1, worst: 1 };
/** Reglamento de las partidas creadas antes de poder configurar los puntos. */
export const LEGACY_SINDICATO_POINTS: SindicatoPoints = [4, 2, 0];
export const LEGACY_PAREJAS_POINTS: ParejasPoints = { best: 1, worst: 0.5 };

/** Puntos efectivos de una partida; sin configuración se usa el reglamento antiguo. */
export const resolveModePoints = (config?: ModePointsConfig | null) => ({
  sindicato: config?.sindicato ?? LEGACY_SINDICATO_POINTS,
  parejas: config?.parejas ?? LEGACY_PAREJAS_POINTS,
});

/** Configuración por defecto que se guarda al crear una partida de ese modo. */
export const defaultModePointsConfig = (mode: GameMode): ModePointsConfig | null => {
  if (mode === 'sindicato') return { sindicato: [...DEFAULT_SINDICATO_POINTS] };
  if (mode === 'parejas') return { parejas: { ...DEFAULT_PAREJAS_POINTS } };
  return null;
};

const isHalfStep = (value: number) => Number.isFinite(value) && Number.isInteger(value * 2);
const inRange = (value: number) => isHalfStep(value) && value >= 0 && value <= 99;

/** Misma regla que valid_mode_points_config en la base de datos. */
export const isValidSindicatoPoints = ([p1, p2, p3]: number[]): boolean =>
  [p1, p2, p3].every(inRange) && p1 >= p2 && p2 >= p3 && p1 > p3;

export const isValidParejasPoints = ({ best, worst }: ParejasPoints): boolean =>
  inRange(best) && inRange(worst) && best + worst > 0;

/** Ventaja máxima que puede ganarse en un hoyo; la usa el cierre anticipado. */
export const sindicatoMaxSwingPerHole = (config?: ModePointsConfig | null) => {
  const [p1, , p3] = resolveModePoints(config).sindicato;
  return p1 - p3;
};
export const parejasMaxPointsPerHole = (config?: ModePointsConfig | null) => {
  const { best, worst } = resolveModePoints(config).parejas;
  return best + worst;
};

const formatPoints = (value: number) => String(value).replace('.', ',');
export const formatSindicatoPoints = (config?: ModePointsConfig | null) =>
  resolveModePoints(config).sindicato.map(formatPoints).join(' / ');
export const formatParejasPoints = (config?: ModePointsConfig | null) => {
  const { best, worst } = resolveModePoints(config).parejas;
  return { best: formatPoints(best), worst: formatPoints(worst) };
};

export const calculateSindicatoPoints = (
  playerId: string,
  allScores: ModeScoreInput[],
  points: SindicatoPoints = LEGACY_SINDICATO_POINTS
): number => {
  const valid = getEnteredModeScores(allScores);
  if (valid.length !== 3) return 0;
  const myScore = valid.find(s => s.playerId === playerId);
  if (!myScore) return 0;
  // Los empatados se reparten a partes iguales los puntos de los puestos que
  // ocupan: con 6-4-2, empate en cabeza 5-5-2, detrás 6-3-3 y triple 4-4-4.
  const sorted = [...valid].sort((a, b) => a.netStrokes - b.netStrokes);
  const tiedPositions = sorted
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s.netStrokes === myScore.netStrokes)
    .map(({ index }) => index);
  const shared = tiedPositions.reduce((sum, index) => sum + points[index], 0);
  return shared / tiedPositions.length;
};

export const calculateParejasPoints = (
  playerId: string,
  allScores: ModeScoreInput[],
  teamAssignments: Record<string, 0 | 1>,
  ballPoints: ParejasPoints = LEGACY_PAREJAS_POINTS
): number => {
  const enteredScores = getEnteredModeScores(allScores);
  if (enteredScores.length < 4) return 0;

  const myTeam = teamAssignments[playerId];
  if (myTeam === undefined) return 0;

  const processedScores = enteredScores;

  const teamScores = processedScores.filter(s => teamAssignments[s.playerId] === myTeam);
  const oppScores = processedScores.filter(s => teamAssignments[s.playerId] !== myTeam);

  if (teamScores.length < 2 || oppScores.length < 2) return 0;

  // Se comparan las mejores bolas netas y las peores; cada comparación vale lo
  // configurado en la partida. Un empate en cualquiera de las dos no reparte
  // nada; eso incluye el hoyo en el que los cuatro marcan raya.
  const teamBest = Math.min(...teamScores.map(s => s.netStrokes));
  const teamWorst = Math.max(...teamScores.map(s => s.netStrokes));
  const oppBest = Math.min(...oppScores.map(s => s.netStrokes));
  const oppWorst = Math.max(...oppScores.map(s => s.netStrokes));

  let points = 0;
  if (teamBest < oppBest) points += ballPoints.best;
  if (teamWorst < oppWorst) points += ballPoints.worst;

  return points;
};

export const calculateModePoints = (
  mode: GameMode,
  playerId: string,
  allScores: ModeScoreInput[],
  teamAssignments?: Record<string, 0 | 1>,
  config?: ModePointsConfig | null
): number => {
  const points = resolveModePoints(config);
  switch (mode) {
    case 'match':
      return calculateMatchPoints(playerId, allScores);
    case 'sindicato':
      return calculateSindicatoPoints(playerId, allScores, points.sindicato);
    case 'parejas':
      return calculateParejasPoints(playerId, allScores, teamAssignments || {}, points.parejas);
    default:
      return 0;
  }
};

interface RoundScoreLike {
  mode_points?: number;
  gross_strokes?: number;
}

export const getTotalModePoints = (scores: Record<number, RoundScoreLike>): number => {
  return Object.values(scores).reduce((sum, s) => sum + (s.mode_points || 0), 0);
};

export const calculateScoreToPar = (
  totalGrossStrokes: number,
  coursePar: number,
  playerHandicap: number
): { value: number; display: string } => {
  const personalPar = coursePar + playerHandicap;
  const scoreToPar = totalGrossStrokes - personalPar;

  let display: string;
  if (scoreToPar === 0) {
    display = 'PAR';
  } else if (scoreToPar > 0) {
    display = `+${scoreToPar}`;
  } else {
    display = `${scoreToPar}`;
  }

  return { value: scoreToPar, display };
};

// --- Darse la Mano (Cierre por ventaja insuperable) ---

export interface MatchStatusResult {
  isFinished: boolean;
  leaderName: string;
  marginText: string;
}

export const checkMatchPlayStatus = (
  roundsMap: Map<string, { scores: Record<number, RoundScoreLike> }>,
  players: { id: string; name: string; playing_handicap: number }[],
  playableHoles: { hole_number: number }[]
): MatchStatusResult => {
  if (players.length < 2) return { isFinished: false, leaderName: '', marginText: '' };

  const p1 = players[0];
  const p2 = players[1];

  let p1Wins = 0;
  let p2Wins = 0;
  let playedHolesCount = 0;

  for (const h of playableHoles) {
    const s1 = roundsMap.get(p1.id)?.scores[h.hole_number];
    const s2 = roundsMap.get(p2.id)?.scores[h.hole_number];

    const s1Valid = s1 && (s1.gross_strokes !== undefined || s1.mode_points !== undefined);
    const s2Valid = s2 && (s2.gross_strokes !== undefined || s2.mode_points !== undefined);

    if (s1Valid && s2Valid) {
      playedHolesCount++;
      const p1Pts = s1.mode_points ?? 0;
      const p2Pts = s2.mode_points ?? 0;

      if (p1Pts > p2Pts) p1Wins++;
      else if (p2Pts > p1Pts) p2Wins++;
    }
  }

  const remainingHoles = playableHoles.length - playedHolesCount;
  const lead = Math.abs(p1Wins - p2Wins);
  const isFinished = lead > remainingHoles && remainingHoles >= 0;

  let leaderName = '';
  if (p1Wins > p2Wins) leaderName = p1.name;
  else if (p2Wins > p1Wins) leaderName = p2.name;

  return {
    isFinished,
    leaderName,
    marginText: `${lead} & ${remainingHoles}`,
  };
};

export const checkParejasStatus = (
  roundsMap: Map<string, { scores: Record<number, RoundScoreLike> }>,
  players: { id: string; name: string }[],
  playableHoles: { hole_number: number }[],
  config?: ModePointsConfig | null
): MatchStatusResult => {
  if (players.length < 4) return { isFinished: false, leaderName: '', marginText: '' };

  const team0 = [players[0], players[1]];
  const team1 = [players[2], players[3]];

  const team0Name = `${team0[0].name} / ${team0[1].name}`;
  const team1Name = `${team1[0].name} / ${team1[1].name}`;

  let t0Points = 0;
  let t1Points = 0;
  let playedHolesCount = 0;

  for (const h of playableHoles) {
    const s0 = roundsMap.get(team0[0].id)?.scores[h.hole_number];
    const s1 = roundsMap.get(team0[1].id)?.scores[h.hole_number];
    const s2 = roundsMap.get(team1[0].id)?.scores[h.hole_number];
    const s3 = roundsMap.get(team1[1].id)?.scores[h.hole_number];

    const isHoleComplete = [s0, s1, s2, s3].every(
      s => s && (s.gross_strokes !== undefined || s.mode_points !== undefined)
    );

    if (isHoleComplete) {
      playedHolesCount++;
      t0Points += s0?.mode_points ?? 0;
      t1Points += s2?.mode_points ?? 0;
    }
  }

  const remainingHoles = playableHoles.length - playedHolesCount;
  const maxPossiblePointsLeft = remainingHoles * parejasMaxPointsPerHole(config);
  const lead = Math.abs(t0Points - t1Points);
  const isFinished = lead > maxPossiblePointsLeft && remainingHoles >= 0;

  let leaderName = '';
  if (t0Points > t1Points) leaderName = team0Name;
  else if (t1Points > t0Points) leaderName = team1Name;

  return {
    isFinished,
    leaderName,
    marginText: `${t0Points} - ${t1Points} ptos`,
  };
};

export const checkSindicatoStatus = (
  roundsMap: Map<string, { scores: Record<number, RoundScoreLike> }>,
  players: { id: string; name: string; playing_handicap: number }[],
  playableHoles: { hole_number: number }[],
  config?: ModePointsConfig | null
): MatchStatusResult => {
  if (players.length < 3) return { isFinished: false, leaderName: '', marginText: '' };

  const totals = players.map(player => ({ player, points: 0 }));
  let playedHolesCount = 0;

  for (const hole of playableHoles) {
    const holeScores = players.map(player => roundsMap.get(player.id)?.scores[hole.hole_number]);
    const isHoleComplete = holeScores.every(
      score => score && (score.gross_strokes !== undefined || score.mode_points !== undefined)
    );

    if (isHoleComplete) {
      playedHolesCount++;
      holeScores.forEach((score, index) => {
        totals[index].points += score?.mode_points ?? 0;
      });
    }
  }

  const sorted = [...totals].sort((a, b) =>
    b.points - a.points || a.player.playing_handicap - b.player.playing_handicap
  );
  const remainingHoles = playableHoles.length - playedHolesCount;
  const lead = sorted[0].points - sorted[1].points;
  const isFinished = lead > remainingHoles * sindicatoMaxSwingPerHole(config) && remainingHoles >= 0;

  return {
    isFinished,
    leaderName: sorted[0].player.name,
    marginText: `${lead} puntos de ventaja`,
  };
};
