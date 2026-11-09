import type { GolfHole, QuickPlayAwardsSummary, RoundPlayer, RoundScore } from '../types';
import { calculateScoreToPar, getStrokesReceived } from './calculations.ts';
import { competitionPosition } from './ranking.ts';

// Estadísticas de una partida vistas por un solo jugador (Mis partidas): cómo jugué yo, no cómo le fue a todos.
// Mismas reglas que la pantalla de estadísticas de la partida: resultado por golpes netos contra el par del hoyo,
// la bola levantada cuenta como doble bogey y no entra en el mejor ni en el peor hoyo.

export interface MyRoundDistribution {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double: number;
  triplePlus: number;
}

export interface MyRoundHole {
  holeNumber: number;
  par: number;
  /** Hándicap del hoyo (la «H» de P4•H1 en la tarjeta). */
  strokeIndex: number;
  played: boolean;
  abandoned: boolean;
  points: number;
  grossStrokes: number;
  /** Golpes de ventaja en el hoyo: los puntitos de la tarjeta. */
  strokesReceived: number;
}

export interface MyRoundAward {
  key: 'mejor-hoyo' | 'peor-hoyo' | 'maquina' | 'montana-rusa' | 'rey-mas-uno' | 'rey-del-bosque' | 'no-paso-rojas' | 'hole-in-one';
  title: string;
  detail: string;
}

export interface MyRoundStanding {
  playerId: string;
  name: string;
  handicap: number;
  points: number;
  toPar: { value: number; display: string };
  position: number;
  isMe: boolean;
}

export interface MyRoundStats {
  position: number;
  totalPlayers: number;
  points: number;
  handicap: number;
  toPar: { value: number; display: string };
  bestHole: { holeNumber: number; points: number } | null;
  worstHole: { holeNumber: number; points: number } | null;
  birdies: number;
  variability: number;
  awards: MyRoundAward[];
  distribution: MyRoundDistribution;
  holes: MyRoundHole[];
  totalGrossStrokes: number;
  standings: MyRoundStanding[];
}

interface PlayerSummary {
  player: RoundPlayer;
  points: number;
  grossStrokes: number;
  toPar: { value: number; display: string };
  bestHole: { holeNumber: number; points: number } | null;
  worstHole: { holeNumber: number; points: number } | null;
  variability: number;
  distribution: MyRoundDistribution;
  holes: MyRoundHole[];
}

const effectiveGrossStrokes = (score: RoundScore | undefined, hole: GolfHole) => {
  if (!score) return 0;
  if (score.gross_strokes > 0) return score.gross_strokes;
  if (score.abandoned) return hole.par + (score.strokes_received || 0) + 2;
  return 0;
};

const summarizePlayer = (player: RoundPlayer, scores: RoundScore[], holes: GolfHole[], coursePar: number): PlayerSummary => {
  const distribution: MyRoundDistribution = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triplePlus: 0 };
  let bestHole: PlayerSummary['bestHole'] = null;
  let worstHole: PlayerSummary['worstHole'] = null;
  let points = 0;
  let grossStrokes = 0;

  // Golpes de ventaja calculados como en la tarjeta de anotación, a partir del HCP de juego y el hándicap del hoyo.
  const strokeIndexes = holes.map(hole => hole.stroke_index);
  const numHoles = holes.length === 9 ? 9 : 18;

  const playerHoles = holes.map((hole): MyRoundHole => {
    const score = scores.find(item => item.player_id === player.id && item.hole_number === hole.hole_number);
    const gross = effectiveGrossStrokes(score, hole);
    const strokesReceived = getStrokesReceived(player.playing_handicap, hole.stroke_index, numHoles, strokeIndexes);
    const base = { holeNumber: hole.hole_number, par: hole.par, strokeIndex: hole.stroke_index, strokesReceived };
    grossStrokes += gross;
    if (!score) return { ...base, played: false, abandoned: false, points: 0, grossStrokes: 0 };
    if (score.abandoned) {
      distribution.double++;
      return { ...base, played: true, abandoned: true, points: 0, grossStrokes: gross };
    }

    const holePoints = score.stableford_points || 0;
    points += holePoints;
    if (!bestHole || holePoints > bestHole.points) bestHole = { holeNumber: hole.hole_number, points: holePoints };
    if (!worstHole || holePoints < worstHole.points) worstHole = { holeNumber: hole.hole_number, points: holePoints };

    const diff = score.net_strokes - hole.par;
    if (diff <= -2) distribution.eagle++;
    else if (diff === -1) distribution.birdie++;
    else if (diff === 0) distribution.par++;
    else if (diff === 1) distribution.bogey++;
    else if (diff === 2) distribution.double++;
    else distribution.triplePlus++;

    return { ...base, played: true, abandoned: false, points: holePoints, grossStrokes: gross };
  });

  const best = bestHole as PlayerSummary['bestHole'];
  const worst = worstHole as PlayerSummary['worstHole'];
  return {
    player,
    points,
    grossStrokes,
    toPar: grossStrokes === 0 ? { value: 0, display: '-' } : calculateScoreToPar(grossStrokes, coursePar, player.playing_handicap),
    bestHole: best,
    worstHole: worst,
    variability: best && worst ? best.points - worst.points : 0,
    distribution,
    holes: playerHoles,
  };
};

export interface MyRoundEvolutionPoint {
  holeNumber: number;
  played: boolean;
  par: number;
  points: number;
  grossStrokes: number;
  /** Puntos sumados hasta este hoyo (incluido). */
  cumulativePoints: number;
  /** Jugar a tu hándicap: 2 puntos por hoyo. */
  handicapLine: number;
}

/** Evolución hoyo a hoyo para las gráficas de Mis partidas. */
export const buildEvolution = (holes: MyRoundHole[]): MyRoundEvolutionPoint[] => {
  let cumulativePoints = 0;
  return holes.map((hole, index) => {
    if (hole.played) cumulativePoints += hole.points;
    return {
      holeNumber: hole.holeNumber,
      played: hole.played,
      par: hole.par,
      points: hole.points,
      grossStrokes: hole.grossStrokes,
      cumulativePoints,
      handicapLine: 2 * (index + 1),
    };
  });
};

/** Como en la pantalla de estadísticas: gana el primero con el valor más alto (o más bajo). */
const leaderBy = (summaries: PlayerSummary[], value: (summary: PlayerSummary) => number, lowest = false) =>
  summaries.reduce((leader, summary) => (lowest ? value(summary) < value(leader) : value(summary) > value(leader)) ? summary : leader, summaries[0]);

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

export const computeMyRoundStats = (
  me: RoundPlayer,
  players: RoundPlayer[],
  scores: RoundScore[],
  holes: GolfHole[],
  summary: Pick<QuickPlayAwardsSummary, 'ranking' | 'awards'>,
): MyRoundStats => {
  const coursePar = holes.reduce((total, hole) => total + hole.par, 0);
  const summaries = players.map(player => summarizePlayer(player, scores, holes, coursePar));
  const mine = summaries.find(item => item.player.id === me.id) ?? summarizePlayer(me, scores, holes, coursePar);
  const isMine = (summary?: PlayerSummary) => summary?.player.id === me.id;
  const awards: MyRoundAward[] = [];

  const best = leaderBy(summaries, item => item.bestHole?.points ?? -999);
  if (isMine(best) && mine.bestHole) awards.push({ key: 'mejor-hoyo', title: 'Mejor Hoyo', detail: `Hoyo ${mine.bestHole.holeNumber}: ${plural(mine.bestHole.points, 'punto')}` });
  const worst = leaderBy(summaries, item => item.worstHole?.points ?? 999, true);
  if (isMine(worst) && mine.worstHole) awards.push({ key: 'peor-hoyo', title: 'Momento Difícil', detail: `Peor hoyo de la partida: el ${mine.worstHole.holeNumber}` });
  const birdieKing = leaderBy(summaries, item => item.distribution.birdie);
  if (isMine(birdieKing) && mine.distribution.birdie > 0) awards.push({ key: 'maquina', title: 'Máquina', detail: `Birdie King: ${plural(mine.distribution.birdie, 'birdie')}` });
  const rollerCoaster = leaderBy(summaries, item => item.variability);
  if (isMine(rollerCoaster) && mine.variability > 0) awards.push({ key: 'montana-rusa', title: 'Montaña Rusa', detail: `Mayor variación: ${plural(mine.variability, 'punto')}` });
  const bogeyKing = leaderBy(summaries, item => item.distribution.bogey);
  if (isMine(bogeyKing) && mine.distribution.bogey > 0) awards.push({ key: 'rey-mas-uno', title: 'Rey de +1', detail: `Más bogeys: ${mine.distribution.bogey}` });
  if (summary.awards.reyDelBosque?.players.some(player => player.id === me.id)) {
    awards.push({ key: 'rey-del-bosque', title: 'Rey del Bosque', detail: `Más dobles bogeys o peor: ${summary.awards.reyDelBosque.count}` });
  }
  if (summary.awards.noPasoRojas?.players.some(player => player.id === me.id)) {
    awards.push({ key: 'no-paso-rojas', title: 'No Pasó Rojas', detail: 'Premio a la salida más corta' });
  }
  const holeInOne = summary.awards.holeInOne?.players.find(item => item.player.id === me.id);
  if (holeInOne) awards.push({ key: 'hole-in-one', title: 'Hole in One', detail: plural(holeInOne.count, 'hoyo en uno', 'hoyos en uno') });

  const standings = summary.ranking.map((entry, index): MyRoundStanding => {
    const playerSummary = summaries.find(item => item.player.id === entry.player.id) ?? summarizePlayer(entry.player, scores, holes, coursePar);
    return {
      playerId: entry.player.id,
      name: entry.player.name,
      handicap: entry.player.playing_handicap,
      points: playerSummary.points,
      toPar: playerSummary.toPar,
      position: competitionPosition(summary.ranking, index, (a, b) => a.totalPoints === b.totalPoints && a.player.playing_handicap === b.player.playing_handicap),
      isMe: entry.player.id === me.id,
    };
  });
  const myStanding = standings.find(item => item.isMe);

  return {
    position: myStanding?.position ?? 0,
    totalPlayers: standings.length || players.length,
    points: mine.points,
    handicap: me.playing_handicap,
    toPar: mine.toPar,
    bestHole: mine.bestHole,
    worstHole: mine.worstHole,
    birdies: mine.distribution.birdie,
    variability: mine.variability,
    awards,
    distribution: mine.distribution,
    holes: mine.holes,
    totalGrossStrokes: mine.grossStrokes,
    standings,
  };
};
