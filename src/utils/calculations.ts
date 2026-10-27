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

export const calculateSindicatoPoints = (playerId: string, allScores: ModeScoreInput[]): number => {
  const valid = getEnteredModeScores(allScores);
  if (valid.length < 3) return 0;
  const myScore = valid.find(s => s.playerId === playerId);
  if (!myScore) return 0;
  const sorted = [...valid].sort((a, b) => a.netStrokes - b.netStrokes);
  const myIdx = sorted.findIndex(s => s.playerId === playerId);
  if (sorted.length === 3) {
    if (sorted[0].netStrokes === sorted[1].netStrokes && sorted[1].netStrokes === sorted[2].netStrokes) {
      return 2;
    }
    if (sorted[0].netStrokes === sorted[1].netStrokes) {
      return myIdx <= 1 ? 3 : 0;
    }
    if (sorted[1].netStrokes === sorted[2].netStrokes) {
      return myIdx === 0 ? 4 : 1;
    }
    return [4, 2, 0][myIdx];
  }
  return 0;
};

export const PAREJAS_BEST_BALL_POINTS = 1;
export const PAREJAS_WORST_BALL_POINTS = 0.5;
export const PAREJAS_MAX_POINTS_PER_HOLE = PAREJAS_BEST_BALL_POINTS + PAREJAS_WORST_BALL_POINTS;

export const calculateParejasPoints = (
  playerId: string,
  allScores: ModeScoreInput[],
  teamAssignments: Record<string, 0 | 1>
): number => {
  const enteredScores = getEnteredModeScores(allScores);
  if (enteredScores.length < 4) return 0;

  const myTeam = teamAssignments[playerId];
  if (myTeam === undefined) return 0;

  const processedScores = enteredScores;

  const teamScores = processedScores.filter(s => teamAssignments[s.playerId] === myTeam);
  const oppScores = processedScores.filter(s => teamAssignments[s.playerId] !== myTeam);

  if (teamScores.length < 2 || oppScores.length < 2) return 0;

  // Se comparan las mejores bolas netas (1 punto) y las peores (0,5 puntos).
  // Un empate en cualquiera de las dos comparaciones no reparte nada; eso
  // incluye el hoyo en el que los cuatro marcan raya.
  const teamBest = Math.min(...teamScores.map(s => s.netStrokes));
  const teamWorst = Math.max(...teamScores.map(s => s.netStrokes));
  const oppBest = Math.min(...oppScores.map(s => s.netStrokes));
  const oppWorst = Math.max(...oppScores.map(s => s.netStrokes));

  let points = 0;
  if (teamBest < oppBest) points += PAREJAS_BEST_BALL_POINTS;
  if (teamWorst < oppWorst) points += PAREJAS_WORST_BALL_POINTS;

  return points;
};

export const calculateModePoints = (
  mode: GameMode,
  playerId: string,
  allScores: ModeScoreInput[],
  teamAssignments?: Record<string, 0 | 1>
): number => {
  switch (mode) {
    case 'match':
      return calculateMatchPoints(playerId, allScores);
    case 'sindicato':
      return calculateSindicatoPoints(playerId, allScores);
    case 'parejas':
      return calculateParejasPoints(playerId, allScores, teamAssignments || {});
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
  playableHoles: { hole_number: number }[]
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
  const maxPossiblePointsLeft = remainingHoles * PAREJAS_MAX_POINTS_PER_HOLE;
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
  playableHoles: { hole_number: number }[]
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
  const isFinished = lead > remainingHoles * 4 && remainingHoles >= 0;

  return {
    isFinished,
    leaderName: sorted[0].player.name,
    marginText: `${lead} puntos de ventaja`,
  };
};
