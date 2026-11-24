import { WriteButton, useReadOnly } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useState, useEffect, useRef } from 'react';
import { GolfHole, RoundPlayer, RoundScore, GameMode, DecidedResult, ScoreChangeInput } from '../types';
import { HoleCard } from './HoleCard';
import { ConfirmModal } from './ConfirmModal';
import { CourseChangeModal } from './CourseChangeModal';
import { CourseChangeConfirmModal } from './CourseChangeConfirmModal';
import { ScoreSymbol } from './ScoreSymbol';
import { golfService } from '../services/golfService';
import { getStrokesReceived } from '../utils/calculations';
import { competitionPosition, sortByResultAndHandicap } from '../utils/ranking';
import { ChevronLeft, ChevronRight, Trophy, Lock, MapPin, Eye, EyeOff, Hand } from 'lucide-react';
import { HandshakeModal } from './HandshakeModal';
import { ThemeToggle } from './ThemeToggle';
import { FinalResultModal } from './FinalResultModal';
import { calculateFinalResult, isDecidedBeforeLastHole, type FinalResult } from '../utils/finalResult';
import { groupSettingsService, GAMIFICATION_UPDATED_EVENT } from '../services/groupSettingsService';
import { enabledExtraProducts } from '../data/gamification';
import { GamificationBadge } from './GamificationBadge';

import { PlayerName } from './PlayerName';
import type { GolfRound } from '../types';

const PODIUM_MEDALS = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-900', 'bg-orange-300 text-orange-950'];

interface StandingEntry {
  key: string;
  name: string;
  isGuest?: boolean;
  handicap: number;
  points: number;
  /** Neto respecto al par en los hoyos jugados; null si aún no ha jugado ninguno. */
  toPar: number | null;
  /** Etiqueta junto al nombre (P1/P2 en Parejas, «Tu partida» en la general del grupo). */
  tag?: React.ReactNode;
  /** Títulos de gamificación marcados (en toda la partida) y en qué hoyos. */
  marks?: Array<{ productId: string; holes: number[] }>;
}

/** Ordena por puntos y, a igualdad, por menos puntos de juego; añade posición y frase respecto al líder. */
function rankStandings(entries: StandingEntry[]) {
  const sorted = sortByResultAndHandicap(entries, entry => entry.points, entry => entry.handicap);
  const leaderPoints = sorted[0]?.points ?? 0;
  const tiedAtTop = sorted.filter(entry => entry.points === leaderPoints && entry.handicap === sorted[0].handicap).length > 1;
  return sorted.map((entry, index) => {
    const position = competitionPosition(sorted, index, (a, b) => a.points === b.points && a.handicap === b.handicap);
    const gap = leaderPoints - entry.points;
    const subtitle = position === 1
      ? (tiedAtTop ? 'Empatado en cabeza' : 'Líder provisional')
      : gap === 0 ? 'Mismos puntos que el líder' : `A ${gap} ${gap === 1 ? 'pt' : 'pts'} del líder`;
    return { entry, position, subtitle };
  });
}

/** Ficha de clasificación: medalla | nombre y situación | puntos y neto al par; debajo, las marcas de gamificación. */
function StandingRow({ entry, position, subtitle }: ReturnType<typeof rankStandings>[number]) {
  const { toPar } = entry;
  const toParLabel = toPar === null ? '-' : toPar === 0 ? 'Par' : toPar > 0 ? `+${toPar}` : `−${Math.abs(toPar)}`;
  // Bajo par en azul, al par con el color del texto y sobre par en rojo.
  const toParClass = toPar === null
    ? 'text-ink-2'
    : toPar < 0
    ? 'text-blue-600 dark:text-blue-400'
    : toPar === 0
    ? 'text-ink'
    : 'text-red-600 dark:text-red-400';
  // Puntos (con fondo) y neto al par (sin fondo, centrado debajo): entre los dos, la altura de la medalla con nombre y situación.
  const valueBox = 'rounded-full px-3 text-base font-black leading-5 tabular-nums';
  const marks = entry.marks ?? [];
  const [showAllMarks, setShowAllMarks] = useState(false);
  const visibleMarkLimit = 5;
  const hiddenMarkCount = marks.length - visibleMarkLimit;
  const visibleMarks = showAllMarks ? marks : marks.slice(0, visibleMarkLimit);
  return (
    <div className="rounded-xl border border-accent-ring bg-card px-2.5 py-2 text-left min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-black shadow-sm ${PODIUM_MEDALS[position - 1] ?? 'bg-card-2 text-ink-2 border border-line'}`}>
          {position}º
        </span>
        <div className="min-w-0 flex-1 self-stretch border-l border-accent-ring pl-2 flex flex-col justify-center">
          <div className="flex items-center gap-2 min-w-0">
            <p className="min-w-0 truncate text-lg font-bold text-ink"><PlayerName name={entry.name} />{entry.isGuest && <span className="ml-1 text-xs font-normal text-ink-3">(Invitado)</span>}</p>
            {entry.tag}
          </div>
          <p className="truncate text-sm text-ink-3">{subtitle}</p>
        </div>
        <div className="flex min-w-[5.25rem] shrink-0 flex-col items-center gap-0.5 self-stretch justify-center">
          <span className={`${valueBox} py-0.5 bg-emerald-300 text-emerald-950`}>{entry.points} pts</span>
          <span className={`${valueBox} ${toParClass}`} title="Cómo va respecto al par, con puntos de juego, en los hoyos jugados">
            {toParLabel}
          </span>
        </div>
      </div>
      {/* Marcas de gamificación: una píldora por título, solo icono y «×N» si se repite. */}
      {marks.length > 0 && (
        <div className="ml-[calc(3.5rem+1px)] mt-2 flex flex-wrap items-center gap-1.5 border-t border-accent-ring pt-1.5">
          {visibleMarks.map(mark => (
            <span
              key={mark.productId}
              className={mark.holes.length > 1
                ? 'inline-flex min-w-9 items-center justify-center gap-1 rounded-full border border-accent-ring bg-card-2 px-1.5 py-px'
                : 'inline-flex items-center'}
            >
              <GamificationBadge
                productId={mark.productId}
                size={19}
                detail={`${mark.holes.length === 1 ? 'Hoyo' : 'Hoyos'} ${mark.holes.join(', ')}`}
              />
              {mark.holes.length > 1 && <span className="text-xs font-bold text-ink tabular-nums">×{mark.holes.length}</span>}
            </span>
          ))}
          {hiddenMarkCount > 0 && (
            <button
              type="button"
              aria-expanded={showAllMarks}
              aria-label={showAllMarks ? 'Mostrar menos marcas' : `Mostrar ${hiddenMarkCount} marcas más`}
              className="min-h-8 min-w-8 rounded-full border border-accent-ring px-2 text-xs font-bold text-ink"
              onClick={() => setShowAllMarks(current => !current)}
            >
              {showAllMarks ? '−' : `+${hiddenMarkCount}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Puntos Stableford y neto respecto al par en los hoyos jugados (no abandonados). */
function playerTotals(scores: Iterable<RoundScore>, parOf: (holeNumber: number) => number | undefined) {
  let points = 0;
  let toPar = 0;
  let played = 0;
  for (const score of scores) {
    points += score.stableford_points ?? 0;
    const par = parOf(score.hole_number);
    if (!score.gross_strokes || score.abandoned || par === undefined) continue;
    toPar += score.gross_strokes - (score.strokes_received || 0) - par;
    played++;
  }
  return { points, toPar: played > 0 ? toPar : null };
}


interface ScorecardProps {
  holes: GolfHole[];
  players: RoundPlayer[];
  rounds: Array<{
    playerId: string;
    scores: Record<number, RoundScore>;
    totalStablefordPoints: number;
  }>;
  currentHole: number;
  numHoles: 9 | 18;
  roundId?: string;
  courseId?: string;
  accessCode?: string;
  hasEditAccess?: boolean;
  isCreator?: boolean;
  canFinishRound?: boolean;
  isRoundFinished?: boolean;
  courseName?: string;
  /** Fecha de creación de la partida: marca el día de la clasificación general del grupo. */
  roundDate?: string | null;
  groupCode?: string | null;
  groupId?: string | null;
  hoyo19Enabled?: boolean;
  gameMode?: GameMode;
  decidedResult?: DecidedResult | null;
  /** Hoyos cerrados al quedar decidida la partida (no se pueden modificar). */
  decidedHoles?: number[] | null;
  onHoleChange: (holeNumber: number) => void;
  onScoreChange: (playerId: string, holeNumber: number, score: ScoreChangeInput | null) => void;
  onResetGame: () => void;
  backDestination?: 'back' | 'home';
  onFinishRound: () => void;
  onCourseChanged?: (courseId: string, numHoles: 9 | 18, holes: GolfHole[], players?: RoundPlayer[]) => void;
  messagesButton?: React.ReactNode;
}

export const Scorecard: React.FC<ScorecardProps> = ({
  holes,
  players,
  rounds,
  currentHole,
  numHoles,
  roundId,
  courseId,
  accessCode,
  hasEditAccess = true,
  isCreator = false,
  canFinishRound = false,
  isRoundFinished = false,
  courseName = '',
  roundDate = null,
  groupCode = null,
  groupId = null,
  hoyo19Enabled,
  gameMode = 'stableford',
  decidedResult = null,
  decidedHoles = null,
  onHoleChange,
  onScoreChange,
  onResetGame, backDestination = 'back',
  onFinishRound,
  onCourseChanged,
  messagesButton,
}) => {
  // null = aún no leída (o error): se usa el comportamiento clásico del grupo.
  const [enabledGamification, setEnabledGamification] = useState<string[] | null>(null);
  useEffect(() => {
    if (!groupId) { setEnabledGamification(null); return; }
    let cancelled = false;
    const load = () => { void groupSettingsService.getEnabledGamification(groupId).then(ids => { if (!cancelled) setEnabledGamification(ids); }); };
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ groupId?: string }>).detail;
      if (!detail?.groupId || detail.groupId === groupId) load();
    };
    load();
    window.addEventListener(GAMIFICATION_UPDATED_EVENT, onUpdated);
    return () => { cancelled = true; window.removeEventListener(GAMIFICATION_UPDATED_EVENT, onUpdated); };
  }, [groupId]);
  // Clasificación general del grupo: todas las tarjetas del grupo del día de esta partida.
  const [groupDayRounds, setGroupDayRounds] = useState<Array<{ round: GolfRound; players: RoundPlayer[]; scores: RoundScore[]; pars: Map<number, number> }>>([]);
  const courseParsCache = useRef(new Map<string, Map<number, number>>());
  useEffect(() => {
    if (!groupId) { setGroupDayRounds([]); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const rounds = await golfService.getGroupRoundsOfDay(groupId, roundDate ?? new Date().toISOString());
        const details = await Promise.all(rounds.map(async round => {
          const parsKey = `${round.course_id}:${round.num_holes}:${round.holes_range ?? ''}`;
          let pars = courseParsCache.current.get(parsKey);
          if (!pars) {
            const courseHoles = await golfService.getCourseHoles(round.course_id, round.num_holes, round.holes_range);
            pars = new Map(courseHoles.map(h => [h.hole_number, h.par]));
            courseParsCache.current.set(parsKey, pars);
          }
          const [roundPlayers, roundScores] = await Promise.all([golfService.getRoundPlayers(round.id), golfService.getRoundScores(round.id)]);
          return { round, players: roundPlayers, scores: roundScores, pars };
        }));
        if (!cancelled) setGroupDayRounds(details);
      } catch (loadError) {
        console.error('No se ha podido cargar la clasificación general del grupo:', loadError);
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [groupId, roundId, roundDate]);
  const legacyRojas = hoyo19Enabled ?? groupCode === 'DIVEND';
  const isDivend = groupCode === 'DIVEND' || (enabledGamification ? enabledGamification.includes('no-paso-rojas') : legacyRojas);
  const spanishHandsEnabled = groupCode !== null && (enabledGamification ? enabledGamification.includes('spanish-hand') : true);
  const extraGamification = enabledExtraProducts(enabledGamification);
  const isModeScoring = gameMode !== 'stableford';
  const modeLabels: Record<GameMode, string> = {
    stableford: 'Stableford',
    match: 'Match Play',
    sindicato: 'Sindicato',
    parejas: 'Parejas',
  };
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showPendingScoresModal, setShowPendingScoresModal] = useState(false);
  const pendingWarningShownForAttempt = useRef(false);
  const [showAccessCode, setShowAccessCode] = useState(false);
  useEffect(() => {
    console.log('📊 Scorecard: Players prop updated:', players.map(p => ({ name: p.name, playing_handicap: p.playing_handicap })));
  }, [players]);

  const [showCourseChangeModal, setShowCourseChangeModal] = useState(false);
  const [showCourseConfirmModal, setShowCourseConfirmModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<{id: string; name: string} | null>(null);
  const [changingCourse, setChangingCourse] = useState(false);
  const [error, setError] = useState('');
  const playableHoles = holes;
  const hole = playableHoles[currentHole - 1];
  const displayedHoleNumber = hole?.hole_number ?? currentHole;
  const displayedHoleTotal = playableHoles.length > 0
    ? Math.max(...playableHoles.map((playableHole) => playableHole.hole_number))
    : numHoles;
  const roundsMap = new Map(rounds.map((r) => [r.playerId, r]));
  // Hay partida en marcha en cuanto alguien tiene un golpe anotado.
  const hasStartedScoring = rounds.some(round => Object.values(round.scores).some(score => (score?.gross_strokes ?? 0) > 0));
  const [showFinalStandings, setShowFinalStandings] = useState(false);

  const markedHoles = (scores: RoundScore[], isMarked: (score: RoundScore) => boolean | undefined) =>
    scores.filter(score => isMarked(score)).map(score => score.hole_number).sort((a, b) => a - b);
  // Iconos de las fichas de clasificación: títulos activos del grupo con alguna marca en la partida.
  const gamificationMarks = (scores: RoundScore[]) => [
    ...(isDivend ? [{ productId: 'no-paso-rojas', holes: markedHoles(scores, score => score.no_paso_rojas) }] : []),
    ...(spanishHandsEnabled ? [{ productId: 'spanish-hand', holes: markedHoles(scores, score => score.spanish_hands) }] : []),
    ...extraGamification.map(product => ({
      productId: product.id,
      holes: markedHoles(scores, score => score.gamification_events?.includes(product.id)),
    })),
  ].filter(mark => mark.holes.length > 0);

  // Clasificación de esta tarjeta (puntos Stableford y neto respecto al par en los hoyos jugados).
  const cardStandings = rankStandings(players.map(player => {
    const round = roundsMap.get(player.id);
    const cardScores = playableHoles.map(h => round?.scores[h.hole_number]).filter((score): score is RoundScore => Boolean(score));
    const totals = playerTotals(
      cardScores,
      holeNumber => playableHoles.find(h => h.hole_number === holeNumber)?.par,
    );
    const isParejas = gameMode === 'parejas' && players.length === 4;
    const team = players.indexOf(player) < 2 ? 0 : 1;
    return {
      key: player.id,
      name: player.name,
      isGuest: player.is_guest,
      handicap: player.playing_handicap,
      ...totals,
      marks: gamificationMarks(cardScores),
      tag: isParejas ? (
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${team === 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
          {team === 0 ? 'P1' : 'P2'}
        </span>
      ) : undefined,
    };
  }));

  // General del grupo: solo con más de una tarjeta ese día. Esta tarjeta usa sus datos en vivo.
  const groupStandings = groupId && groupDayRounds.length >= 2
    ? rankStandings(groupDayRounds.flatMap(({ round, players: roundPlayers, scores: roundScores, pars }) => {
        const mine = round.id === roundId;
        return roundPlayers.map((player): StandingEntry => {
          const scores = mine
            ? Object.values(roundsMap.get(player.id)?.scores ?? {})
            : roundScores.filter(score => score.player_id === player.id);
          return {
            key: `${round.id}:${player.id}`,
            name: player.name,
            isGuest: player.is_guest,
            handicap: player.playing_handicap,
            ...playerTotals(scores, holeNumber => pars.get(holeNumber)),
            marks: gamificationMarks(scores),
            tag: mine ? <span className="shrink-0 rounded-md border border-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-ink">Tu partida</span> : undefined,
          };
        });
      }))
    : null;

  // Gamificación (No pasó de rojas, Spanish Hands y títulos del Pro-Shop): solo jugadores con marcas
  // y sin secciones vacías. Se usa para esta tarjeta y para todas las del grupo ese día.
  interface GamificationPerson { key: string; player: RoundPlayer; tag?: React.ReactNode; scores: RoundScore[] }
  const cardGamificationPeople: GamificationPerson[] = players.map(player => {
    const round = roundsMap.get(player.id);
    const isParejas = gameMode === 'parejas' && players.length === 4;
    const team = players.indexOf(player) < 2 ? 0 : 1;
    return {
      key: player.id,
      player,
      scores: playableHoles.map(h => round?.scores[h.hole_number]).filter((score): score is RoundScore => Boolean(score)),
      tag: isParejas ? (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${team === 0 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-100 dark:border dark:border-blue-700' : 'bg-red-100 text-red-800 dark:bg-red-900/80 dark:text-red-100 dark:border dark:border-red-700'}`}>
          {team === 0 ? 'P1' : 'P2'}
        </span>
      ) : undefined,
    };
  });
  const groupGamificationPeople: GamificationPerson[] = groupStandings
    ? groupDayRounds.flatMap(({ round, players: roundPlayers, scores: roundScores }) => {
        const mine = round.id === roundId;
        return roundPlayers.map(player => ({
          key: `${round.id}:${player.id}`,
          player,
          scores: mine
            ? Object.values(roundsMap.get(player.id)?.scores ?? {})
            : roundScores.filter(score => score.player_id === player.id),
          tag: mine ? <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-on-accent">Tu partida</span> : undefined,
        }));
      })
    : [];
  const playerLabel = (person: GamificationPerson, small = false) => (
    <div className="flex items-center gap-2 min-w-0">
      {person.tag}
      <p className={`font-semibold text-ink truncate ${small ? 'text-sm' : ''}`}><PlayerName name={person.player.name} />{person.player.is_guest && <span className="ml-1 text-xs font-normal text-ink-3">(Invitado)</span>}</p>
    </div>
  );
  const renderGamification = (people: GamificationPerson[], titleSuffix: string) => {
    // Rojas va arriba a todo el ancho; el resto, 1 o 2 títulos a todo el ancho y con más de 2, en dos columnas.
    const rojas = isDivend
      ? people
          .map(person => ({ person, holes: markedHoles(person.scores, score => score.no_paso_rojas) }))
          .filter(item => item.holes.length > 0)
          .sort((a, b) => b.holes.length - a.holes.length)
      : [];
    const sections = [
      ...(spanishHandsEnabled ? [{
        id: 'spanish-hand', name: 'Spanish Hands', chip: 'bg-accent text-on-accent',
        row: 'bg-accent-soft border-accent-ring', box: 'bg-accent-soft border-accent-ring', count: 'text-accent-ink',
        isMarked: (score: RoundScore) => score.spanish_hands,
      }] : []),
      ...extraGamification.map(product => ({
        id: product.id, name: product.name, chip: product.badge,
        row: 'bg-card-2 border-line', box: 'bg-card border-line', count: 'text-ink',
        isMarked: (score: RoundScore) => score.gamification_events?.includes(product.id),
      })),
    ]
      .map(section => ({
        ...section,
        marked: people
          .map(person => ({ person, holes: markedHoles(person.scores, section.isMarked) }))
          .filter(item => item.holes.length > 0)
          .sort((a, b) => b.holes.length - a.holes.length),
      }))
      .filter(section => section.marked.length > 0);
    if (!rojas.length && !sections.length) return null;
    const twoColumns = sections.length > 2;
    return (
      <>
        {rojas.length > 0 && (
          <>
            <h3 className="font-semibold text-ink-2 mb-3 mt-6 flex items-center gap-2">
              <GamificationBadge productId="no-paso-rojas" size={22} />
              No pasó de rojas{titleSuffix}
            </h3>
            <div className="space-y-3">
              {rojas.map(({ person, holes }) => (
                <div key={person.key} className="bg-red-50 border-2 border-red-200 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    {playerLabel(person)}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {holes.map(holeNumber => (
                        <span key={holeNumber} className="bg-red-600 text-white text-xs font-bold rounded-full px-2 py-0.5">
                          Hoyo {holeNumber}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-red-100 border-2 border-red-300 rounded-lg px-4 py-2 min-w-[60px] text-center">
                    <p className="text-2xl font-bold text-red-600">{holes.length}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {sections.length > 0 && (
          <div className={twoColumns ? 'grid grid-cols-2 gap-x-3' : ''}>
            {sections.map(section => (
              <div key={section.id} className="min-w-0">
                <h3 className={`font-semibold text-ink-2 mb-3 mt-6 flex items-center gap-2 min-w-0 ${twoColumns ? 'text-sm' : ''}`}>
                  <GamificationBadge productId={section.id} size={twoColumns ? 18 : 22} />
                  <span className="truncate" title={`${section.name}${titleSuffix}`}>{section.name}{titleSuffix}</span>
                </h3>
                <div className={twoColumns ? 'space-y-2' : 'space-y-3'}>
                  {section.marked.map(({ person, holes }) => (
                    <div key={person.key} className={`${section.row} border-2 rounded-lg flex items-center justify-between gap-2 ${twoColumns ? 'p-2' : 'p-3'}`}>
                      <div className="min-w-0">
                        {playerLabel(person, twoColumns)}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {holes.map(holeNumber => (
                            <span key={holeNumber} className={`${section.chip} font-bold rounded-full ${twoColumns ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}>
                              {twoColumns ? `H${holeNumber}` : `Hoyo ${holeNumber}`}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className={`${section.box} border-2 rounded-lg text-center shrink-0 ${twoColumns ? 'px-2 py-1 min-w-[40px]' : 'px-4 py-2 min-w-[60px]'}`}>
                        <p className={`font-bold ${section.count} ${twoColumns ? 'text-lg' : 'text-2xl'}`}>{holes.length}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  const isEnteredScore = (score?: RoundScore) => !!score && (score.abandoned || score.gross_strokes > 0);
  const allScoresComplete = players.every((player) => {
    const round = roundsMap.get(player.id);
    return playableHoles.every((h) => isEnteredScore(round?.scores[h.hole_number]));
  });
  const lastPlayableHole = playableHoles[playableHoles.length - 1];
  const lastHoleScoresComplete = !!lastPlayableHole && players.length > 0 && players.every((player) =>
    isEnteredScore(roundsMap.get(player.id)?.scores[lastPlayableHole.hole_number])
  );
  const hasPendingScoresBeforeLastHole = playableHoles.slice(0, -1).some((h) =>
    players.some((player) => !isEnteredScore(roundsMap.get(player.id)?.scores[h.hole_number]))
  );

  const isLastHole = currentHole === playableHoles.length;

  // No se pasa al hoyo siguiente hasta que todos los jugadores tengan su resultado en este hoyo.
  // Las cuentas de solo lectura y las partidas finalizadas solo consultan: pueden moverse libremente.
  const isReadOnly = useReadOnly();
  const playersMissingCurrentHole = hole
    ? players.filter(player => !isEnteredScore(roundsMap.get(player.id)?.scores[hole.hole_number]))
    : [];
  const blockNextHole = !isRoundFinished && !isReadOnly && playersMissingCurrentHole.length > 0;

  // Partida decidida (shakehands): el resultado es definitivo. Los hoyos ya jugados al decidirse quedan
  // cerrados (la base de datos lo impone); si aún no ha llegado la lista, son los primeros jugados.
  const isDecided = isModeScoring && !!decidedResult;
  const lockedHoles = new Set<number>(
    !isDecided ? [] : decidedHoles ?? playableHoles
      .slice(0, Math.max(0, playableHoles.length - (decidedResult?.holes_remaining ?? 0)))
      .map(h => h.hole_number),
  );
  const isCurrentHoleLocked = !!hole && lockedHoles.has(hole.hole_number);
  // El creador puede finalizar una partida decidida en cualquier hoyo, aunque falten hoyos por jugar.
  const canFinishDecidedEarly = isDecided && canFinishRound && !isRoundFinished;

  useEffect(() => {
    if (!lastHoleScoresComplete || allScoresComplete) {
      pendingWarningShownForAttempt.current = false;
      return;
    }

    if (isLastHole && hasPendingScoresBeforeLastHole && !pendingWarningShownForAttempt.current) {
      pendingWarningShownForAttempt.current = true;
      setShowPendingScoresModal(true);
    }
  }, [allScoresComplete, hasPendingScoresBeforeLastHole, isLastHole, lastHoleScoresComplete]);

  const handleFinishWithConfirm = () => {
    console.log('📋 Abriendo modal de confirmación de finalización...');
    setShowFinishModal(true);
  };

  const handleConfirmFinish = async () => {
    setShowFinishModal(false);
    try {
      await onFinishRound();
    } catch (err) {
      console.error('Error al finalizar la partida:', err);
    }
  };

  const handleSelectCourse = (course: { id: string; name: string; description?: string | null }) => {
    setSelectedCourse({ id: course.id, name: course.name });
    setShowCourseChangeModal(false);
    setShowCourseConfirmModal(true);
  };

  const handleConfirmCourseChange = async (selectedHoles: 9 | 18) => {
    if (!onCourseChanged || !roundId || !selectedCourse) return;

    try {
      setChangingCourse(true);
      setError('');

      const { holes: newHoles, players: updatedPlayers } = await golfService.changeCourse(
        roundId,
        selectedCourse.id,
        selectedHoles
      );

      console.log('📊 Scorecard: Players after course change:', updatedPlayers?.map(p => ({ name: p.name, playing: p.playing_handicap })));

      onCourseChanged(selectedCourse.id, selectedHoles, newHoles, updatedPlayers);
      setShowCourseConfirmModal(false);
      setSelectedCourse(null);
    } catch (err) {
      console.error('Error changing course:', err);
      setError('Error al cambiar el campo');
    } finally {
      setChangingCourse(false);
    }
  };

  const [handshakeData, setHandshakeData] = useState<{
    isOpen: boolean;
    winner: string;
    margin: string;
  } | null>(null);
  const [handshakeAcknowledged, setHandshakeAcknowledged] = useState(false);
  const wasDecidedBeforeLastHole = useRef(isDecidedBeforeLastHole(decidedResult));

  useEffect(() => {
    setHandshakeAcknowledged(false);
    setHandshakeData(null);
    wasDecidedBeforeLastHole.current = isDecidedBeforeLastHole(decidedResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, gameMode]);

  useEffect(() => {
    const isNowDecided = isDecidedBeforeLastHole(decidedResult);
    const justDecided = isNowDecided && !wasDecidedBeforeLastHole.current;
    wasDecidedBeforeLastHole.current = isNowDecided;

    if (isRoundFinished || allScoresComplete) {
      if (handshakeData?.isOpen) {
        setHandshakeData(null);
      }
      return;
    }
    if (handshakeAcknowledged || !justDecided || !decidedResult) return;
    setHandshakeData({
      isOpen: true,
      winner: decidedResult.winner_label,
      margin: decidedResult.display_text,
    });
  }, [decidedResult, handshakeAcknowledged, handshakeData?.isOpen, isRoundFinished, allScoresComplete]);

  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const wereScoresComplete = useRef(allScoresComplete);

  useEffect(() => {
    setFinalResult(null);
    wereScoresComplete.current = allScoresComplete;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, gameMode]);

  useEffect(() => {
    const justCompleted = allScoresComplete && !wereScoresComplete.current;
    wereScoresComplete.current = allScoresComplete;
    if (!justCompleted || !isModeScoring || isDecidedBeforeLastHole(decidedResult)) return;
    setFinalResult(calculateFinalResult(
      gameMode,
      players,
      Object.fromEntries(players.map((p) => [p.id, roundsMap.get(p.id)?.scores])),
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allScoresComplete]);

  return (
    <div className="min-h-screen bg-app p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* En móvil ocupa toda la pantalla como el resto de vistas; el marco de tarjeta solo en pantallas anchas. */}
        <div className="md:bg-card md:rounded-lg md:shadow-card md:p-8">
          <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex items-center gap-2">
              <NavigationButton destination={backDestination} onClick={onResetGame} />
              <ThemeToggle className="!h-11 !w-11" />
            </div>
            <div className="flex justify-center">{messagesButton}</div>
            {/* Durante la partida la clasificación ya se ve en la tarjeta; con la partida finalizada, la copa abre la final. */}
            <div className="flex justify-end">
              {isRoundFinished && (
                <button
                  onClick={() => setShowFinalStandings(true)}
                  type="button"
                  className="inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-amber-500 bg-amber-400 p-0 text-amber-950 shadow-soft transition-all hover:bg-amber-500 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                  aria-label="Clasificación final"
                  title="Clasificación final"
                >
                  <Trophy size={22} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          {/* Desde el primer golpe la cabecera se compacta: lo importante pasa a ser el hoyo. */}
          <h1 className={hasStartedScoring ? 'sr-only' : 'mb-6 text-center text-2xl font-bold text-title md:text-3xl'}>
            Tarjeta de Puntuación
          </h1>

          <div className={`mb-4 bg-accent-deep rounded-lg text-white ${hasStartedScoring ? 'p-3' : 'p-4'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`min-w-0 truncate font-bold ${hasStartedScoring ? 'text-base' : 'text-lg'}`}>{courseName || 'Campo de Golf'}</span>
              {/* Cambiar de campo es tarea del creador; con el código solo se informan golpes. */}
              {hasEditAccess && isCreator && onCourseChanged && roundId && courseId && (
                <WriteButton
                  onClick={() => setShowCourseChangeModal(true)}
                  disabled={changingCourse}
                  className="shrink-0 bg-white/10 hover:bg-white/20 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Cambiar campo de golf"
                  aria-label="Cambiar campo de golf"
                >
                  <MapPin size={12} />
                  {!hasStartedScoring && 'Cambiar'}
                </WriteButton>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-on-deep min-w-0">
              <span className="shrink-0">Hoyo {displayedHoleNumber} de {displayedHoleTotal}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 bg-white/10 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide leading-4">
                {modeLabels[gameMode]}
              </span>
              {hasStartedScoring && accessCode && hasEditAccess && (
                <span className="ml-auto flex shrink-0 items-center gap-1" title="Código para ver y editar la partida">
                  <Lock size={14} aria-hidden="true" />
                  <code className="font-bold tracking-widest">{showAccessCode ? accessCode : '••••'}</code>
                  <button
                    onClick={() => setShowAccessCode(!showAccessCode)}
                    className="rounded-md p-1 hover:bg-white/10 transition-colors"
                    aria-label={showAccessCode ? 'Ocultar código' : 'Mostrar código'}
                    title={showAccessCode ? 'Ocultar código' : 'Mostrar código'}
                  >
                    {showAccessCode ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              )}
            </div>
          </div>

          {!hasStartedScoring && accessCode && hasEditAccess && (
            <div className="mb-4 bg-card border-2 border-accent-ring rounded-lg p-3 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="text-accent-ink shrink-0" size={18} />
                  <span className="text-xs sm:text-sm font-medium text-ink-2 shrink-0">
                    Acceso:
                  </span>
                  <code className="text-lg sm:text-xl font-bold text-accent-ink tracking-widest truncate">
                    {showAccessCode ? accessCode : '••••'}
                  </code>
                </div>
                <button
                  onClick={() => setShowAccessCode(!showAccessCode)}
                  className="p-1.5 hover:bg-accent-soft rounded-lg transition-colors text-accent-ink shrink-0"
                  aria-label={showAccessCode ? 'Ocultar código' : 'Mostrar código'}
                  title={showAccessCode ? 'Ocultar código' : 'Mostrar código'}
                >
                  {showAccessCode ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-[11px] sm:text-xs text-ink-3 mt-1.5 truncate">
                Comparte el código para ver y editar la partida
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {!hasEditAccess && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Lock className="text-amber-700" size={20} />
                <span className="text-sm font-medium text-amber-900">
                  {isRoundFinished ? 'Esta partida está finalizada. Puedes consultar los resultados, pero no modificarlos.' : 'Solo lectura - No tienes permiso para editar esta partida'}
                </span>
              </div>
            </div>
          )}

          {isCurrentHoleLocked && !isRoundFinished && hasEditAccess && (
            <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-accent-ring bg-accent-soft px-3 py-2 text-sm font-medium text-accent-ink">
              <Lock size={16} className="shrink-0" aria-hidden="true" />
              Partida decidida: este hoyo ya no se puede modificar.
            </div>
          )}

          {hole && (
            <div className="mb-6">
              <HoleCard
                hole={hole}
                players={players}
                scores={Object.fromEntries(
                  players.map((p) => [p.id, roundsMap.get(p.id)?.scores[hole.hole_number]])
                )}
                numHoles={numHoles}
                allHoles={holes}
                allHoleScores={Object.fromEntries(
                  players.map((p) => [p.id, roundsMap.get(p.id)?.scores || {}])
                )}
                readonly={!hasEditAccess || isCurrentHoleLocked}
                groupCode={groupCode}
                hoyo19Enabled={isDivend}
                spanishHandsEnabled={spanishHandsEnabled}
                enabledGamification={extraGamification.map(item => item.id)}
                gameMode={gameMode}
                teamAssignments={gameMode === 'parejas' && players.length === 4 ? Object.fromEntries(players.map((p, i) => [p.id, i < 2 ? 0 : 1])) : undefined}
                onScoreChange={(playerId, score) => {
                  onScoreChange(playerId, hole.hole_number, score);
                }}
              />
            </div>
          )}

          <div className="mb-6">
            <div className="relative">
              <div className="w-full bg-neutral rounded-full h-3 shadow-inner">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-3 rounded-full transition-all duration-300 shadow-soft"
                  style={{ width: `${(currentHole / playableHoles.length) * 100}%` }}
                />
              </div>
              <p className="text-sm font-medium text-ink-2 mt-2 text-center">
                Hoyo {displayedHoleNumber} de {displayedHoleTotal}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mb-6">
            <button
              onClick={() => onHoleChange(Math.max(1, currentHole - 1))}
              disabled={currentHole === 1}
              className="flex-1 bg-neutral hover:bg-neutral-hover disabled:opacity-50 disabled:cursor-not-allowed text-ink font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <ChevronLeft size={20} />
              Anterior
            </button>

            {isLastHole && ((allScoresComplete && canFinishRound && !isRoundFinished) || canFinishDecidedEarly) ? (
              <WriteButton
                onClick={handleFinishWithConfirm}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                Finalizar
              </WriteButton>
            ) : isLastHole && (isRoundFinished || (allScoresComplete && !canFinishRound)) ? (
              <button
                type="button"
                disabled
                title={isRoundFinished ? 'El creador ha finalizado la partida' : 'Solo el creador puede finalizar la partida'}
                className="flex-1 min-w-0 bg-neutral text-ink-3 text-sm sm:text-base font-semibold px-3 py-3 rounded-lg flex items-center justify-center gap-2 text-center cursor-not-allowed"
              >
                {isRoundFinished && <Lock size={20} className="shrink-0" />}
                <span>{isRoundFinished ? 'Finalizada' : 'Pendiente de finalizar'}</span>
              </button>
            ) : (
              <button
                onClick={() => onHoleChange(Math.min(playableHoles.length, currentHole + 1))}
                disabled={currentHole === playableHoles.length || blockNextHole}
                title={blockNextHole ? 'Informa el resultado de todos los jugadores para pasar al siguiente hoyo' : undefined}
                className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-on-accent font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                Siguiente
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          {!isLastHole && canFinishDecidedEarly && (
            <WriteButton
              onClick={handleFinishWithConfirm}
              className="-mt-3 mb-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              Finalizar partida
            </WriteButton>
          )}

          {!isLastHole && blockNextHole && (
            <p role="status" className="-mt-3 mb-6 text-center text-sm text-ink-3">
              Falta el resultado de {playersMissingCurrentHole.map(player => player.name).join(', ')} en este hoyo.
            </p>
          )}

          {isLastHole && allScoresComplete && !canFinishRound && !isRoundFinished && (
            <p className="-mt-3 mb-6 text-center text-sm text-ink-3">
              Solo el creador de la partida puede finalizarla.
            </p>
          )}

          <div className="border-t pt-4">
            <h3 className="font-semibold text-ink-2 mb-3">Tabla de Golpes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-card-2 border-b">
                    <th className="text-left p-2 font-semibold text-ink-2">Jugador</th>
                    {playableHoles.map((h) => (
                      <th key={h.hole_number} className="text-center p-2 font-semibold text-ink-2 min-w-[40px]">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{h.hole_number}</span>
                          <span className="text-xs font-normal text-ink-3">
                            P{h.par}•H{h.stroke_index}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th className="text-center p-2 font-semibold text-ink-2 bg-neutral min-w-[50px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span>Total</span>
                        <span className="text-xs font-normal text-ink-3">Brutos</span>
                      </div>
                    </th>
                    <th className="text-center p-2 font-semibold text-ink-2 bg-accent-soft min-w-[50px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span>Total</span>
                        <span className="text-xs font-normal text-ink-3">Netos</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const round = roundsMap.get(player.id);
                    const hasAbandonedScores = false;

                    const totalGrossStrokes = playableHoles.reduce((sum, h) => {
                      const score = round?.scores[h.hole_number];
                      if (!score?.gross_strokes) return sum;
                      return sum + score.gross_strokes;
                    }, 0);

                    const totalNetStrokes = playableHoles.reduce((sum, h) => {
                      const score = round?.scores[h.hole_number];
                      if (!score?.gross_strokes) return sum;

                      return sum + (score.gross_strokes - (score.strokes_received || 0));
                    }, 0);

                    return (
                      <tr key={player.id} className="border-b hover:bg-card-2">
                        <td className="p-2 font-medium text-ink">
                          <div className="flex items-center gap-2">
                            {gameMode === 'parejas' && players.length === 4 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${players.indexOf(player) < 2 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-100 dark:border dark:border-blue-700' : 'bg-red-100 text-red-800 dark:bg-red-900/80 dark:text-red-100 dark:border dark:border-red-700'}`}>
                                {players.indexOf(player) < 2 ? 'P1' : 'P2'}
                              </span>
                            )}
                            <span className="truncate"><PlayerName name={player.name} />{player.is_guest && <span className="ml-1 text-xs font-normal text-ink-3">(Invitado)</span>}</span>
                          </div>
                        </td>
                        {playableHoles.map((h) => {
                          const score = round?.scores[h.hole_number];
                          const allStrokeIndexes = holes.map(hole => hole.stroke_index);
                          const strokesReceived = getStrokesReceived(
                            player.playing_handicap,
                            h.stroke_index,
                            numHoles,
                            allStrokeIndexes
                          );

                          return (
                            <td
                              key={h.hole_number}
                              className={`text-center p-2 relative ${
                                h.hole_number === displayedHoleNumber ? 'bg-accent-soft font-bold' : ''
                              }`}
                            >
                              <div className="flex flex-col items-center justify-center gap-1">
                                {score ? (
                                  <div className="relative w-7 h-7 flex items-center justify-center">
                                    <ScoreSymbol
                                      grossStrokes={score.gross_strokes}
                                      par={h.par}
                                      strokesReceived={strokesReceived}
                                      abandoned={score.abandoned}
                                    />
                                    {score.no_paso_rojas && (
                                      <GamificationBadge
                                        productId="no-paso-rojas"
                                        size={14}
                                        detail={`Hoyo ${h.hole_number}`}
                                        className="absolute -left-1.5 -top-1.5 border border-white"
                                      />
                                    )}
                                    {score.spanish_hands && (
                                      <span
                                        className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border border-white bg-accent text-on-accent shadow-soft flex items-center justify-center"
                                        title={`Spanish Hands · Hoyo ${h.hole_number}`}
                                        aria-label={`Spanish Hands en el hoyo ${h.hole_number}`}
                                      >
                                        <Hand size={8} />
                                      </span>
                                    )}
                                    {(score.gamification_events?.length ?? 0) > 0 && (
                                      <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 -space-x-1">
                                        {score.gamification_events!.slice(0, 3).map(productId => (
                                          <GamificationBadge key={productId} productId={productId} size={12} detail={`Hoyo ${h.hole_number}`} className="border border-white" />
                                        ))}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-7 h-7 flex items-center justify-center">
                                    <span className="text-ink-4">-</span>
                                  </div>
                                )}
                                <div className="flex gap-0.5 h-1 min-h-[4px]">
                                  {strokesReceived > 0 && Array.from({ length: strokesReceived }).map((_, idx) => (
                                    <div
                                      key={idx}
                                      className="w-1 h-1 rounded-full bg-blue-500"
                                      title={`${strokesReceived} golpe${strokesReceived > 1 ? 's' : ''} recibido${strokesReceived > 1 ? 's' : ''}`}
                                    />
                                  ))}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                        <td
                          className={`text-center p-2 font-bold ${
                            hasAbandonedScores
                              ? 'text-ink-3'
                              : 'bg-card-2 text-ink'
                          }`}
                          style={hasAbandonedScores ? {
                            background: 'repeating-linear-gradient(45deg, #e5e7eb, #e5e7eb 5px, #d1d5db 5px, #d1d5db 10px)'
                          } : undefined}
                        >
                          {hasAbandonedScores ? '-' : (totalGrossStrokes > 0 ? totalGrossStrokes : '-')}
                        </td>
                        <td
                          className={`text-center p-2 font-bold ${
                            hasAbandonedScores
                              ? 'text-ink-3'
                              : 'bg-accent-soft text-title'
                          }`}
                          style={hasAbandonedScores ? {
                            background: 'repeating-linear-gradient(45deg, #e5e7eb, #e5e7eb 5px, #d1d5db 5px, #d1d5db 10px)'
                          } : undefined}
                        >
                          {hasAbandonedScores ? '-' : (totalGrossStrokes > 0 ? totalNetStrokes : '-')}
                        </td>
                      </tr>
                    );
                  })}
                  {isModeScoring && gameMode !== 'sindicato' && (
                    <tr className="border-b-2 border-accent-ring bg-accent-soft">
                      <td className="p-2 font-bold text-accent-ink text-xs uppercase tracking-wide">Resultado</td>
                      {playableHoles.map((h) => {
                        const holeScores = players.map((p) => {
                          const s = roundsMap.get(p.id)?.scores[h.hole_number];
                          return isEnteredScore(s) ? s?.mode_points ?? 0 : null;
                        });
                        const allPlayed = holeScores.every((v) => v !== null);
                        if (!allPlayed) {
                          return (
                            <td key={h.hole_number} className="text-center p-2">
                              <span className="text-ink-4 text-xs">-</span>
                            </td>
                          );
                        }
                        if (gameMode === 'match' && players.length === 2) {
                          let firstWins = 0, secondWins = 0;
                          const currentHoleIndex = playableHoles.findIndex(ph => ph.hole_number === h.hole_number);
                          playableHoles.slice(0, currentHoleIndex + 1).forEach((ph) => {
                            const first = roundsMap.get(players[0].id)?.scores[ph.hole_number];
                            const second = roundsMap.get(players[1].id)?.scores[ph.hole_number];
                            if (!isEnteredScore(first) || !isEnteredScore(second)) return;
                            const holeDiff = (first?.mode_points ?? 0) - (second?.mode_points ?? 0);
                            if (holeDiff > 0) firstWins++;
                            else if (holeDiff < 0) secondWins++;
                          });
                          const diff = firstWins - secondWins;
                          // Notación de match play: quien va ganando «N UP» (con su color de jugador); empate «A/S».
                          const label = diff === 0 ? 'A/S' : `${Math.abs(diff)} UP`;
                          const color = diff > 0
                            ? 'bg-blue-600 text-white border-blue-400'
                            : diff < 0
                            ? 'bg-red-600 text-white border-red-400'
                            : 'bg-card text-ink border-line-2 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600';
                          return (
                            <td key={h.hole_number} className="text-center p-1">
                              <span className={`inline-block whitespace-nowrap text-[10px] leading-tight tabular-nums font-bold px-1.5 py-0.5 rounded border shadow-sm ${color}`}>{label}</span>
                            </td>
                          );
                        }
                        if (gameMode === 'parejas' && players.length === 4) {
                          let t0Accum = 0, t1Accum = 0;
                          const currentHoleIndex = playableHoles.findIndex(
                            ph => ph.hole_number === h.hole_number
                          );
                          playableHoles.slice(0, currentHoleIndex + 1).forEach((ph) => {
                            const scoresForHole = players.map((p) =>
                              roundsMap.get(p.id)?.scores[ph.hole_number]
                            );
                            const ps = scoresForHole.map((s) => {
                              return isEnteredScore(s) ? s?.mode_points ?? 0 : null;
                            });
                            if (ps.every((v) => v !== null)) {
                              t0Accum += ps[0] ?? 0;
                              t1Accum += ps[2] ?? 0;
                            }
                          });
                          const label = `${t0Accum.toLocaleString('es-ES')}-${t1Accum.toLocaleString('es-ES')}`;
                          const color = t0Accum > t1Accum
                            ? 'bg-blue-600 text-white border-blue-400'
                            : t1Accum > t0Accum
                            ? 'bg-red-600 text-white border-red-400'
                            : 'bg-card text-ink border-line-2 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600';
                          return (
                            <td key={h.hole_number} className="text-center p-1">
                              <span className={`inline-block whitespace-nowrap text-[10px] leading-tight tabular-nums font-bold px-1.5 py-0.5 rounded border shadow-sm ${color}`}>{label}</span>
                            </td>
                          );
                        }
                        return (
                          <td key={h.hole_number} className="text-center p-2">
                            <span className="text-ink-4 text-xs">·</span>
                          </td>
                        );
                      })}
                      <td colSpan={2} className="text-center p-2">
                        {(() => {
                          if (gameMode === 'match' && players.length === 2) {
                            let p0Won = 0, p1Won = 0;
                            playableHoles.forEach((h) => {
                              const s0 = roundsMap.get(players[0].id)?.scores[h.hole_number];
                              const s1 = roundsMap.get(players[1].id)?.scores[h.hole_number];
                              if (s0 && s1) {
                                if ((s0.mode_points ?? 0) > (s1.mode_points ?? 0)) p0Won++;
                                else if ((s0.mode_points ?? 0) < (s1.mode_points ?? 0)) p1Won++;
                              }
                            });
                            const diff = p0Won - p1Won;
                            const label = diff > 0 ? `${diff}UP` : diff < 0 ? `${Math.abs(diff)}UP` : 'AS';
                            const color = diff > 0
                              ? 'bg-blue-600 text-white border-blue-400'
                              : diff < 0
                              ? 'bg-red-600 text-white border-red-400'
                              : 'bg-card text-ink border-line-2 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600';
                            return <span className={`text-xs font-bold px-2 py-1 rounded border shadow-sm ${color}`}>{label}</span>;
                          }
                          if (gameMode === 'parejas' && players.length === 4) {
                            let t0 = 0, t1 = 0;
                            playableHoles.forEach((h) => {
                              const scoresForHole = players.map(p =>
                                roundsMap.get(p.id)?.scores[h.hole_number]
                              );
                              if (scoresForHole.every(Boolean)) {
                                t0 += scoresForHole[0]?.mode_points ?? 0;
                                t1 += scoresForHole[2]?.mode_points ?? 0;
                              }
                            });
                            const label = `${t0.toLocaleString('es-ES')}-${t1.toLocaleString('es-ES')}`;
                            const color = t0 > t1
                              ? 'bg-blue-600 text-white border-blue-400'
                              : t1 > t0
                              ? 'bg-red-600 text-white border-red-400'
                              : 'bg-card text-ink border-line-2 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600';
                            return <span className={`text-xs font-bold px-2 py-1 rounded border shadow-sm ${color}`}>{label}</span>;
                          }
                          return <span className="text-ink-4 text-xs">-</span>;
                        })()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-center gap-x-2.5 sm:gap-x-4 text-[11px] sm:text-xs text-ink-3 whitespace-nowrap overflow-x-auto py-1">
              <div className="flex items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 border border-line-2 shrink-0"></div>
                <span>Eagle</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full bg-red-500 border border-line-2 shrink-0"></div>
                <span>Birdie</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-line-2 shrink-0"></div>
                <span>Par</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border border-line-2 shrink-0"></div>
                <span>Bogey</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-full bg-black border border-line-2 shrink-0"></div>
                <span>Peor</span>
              </div>
            </div>

            <h3 className="font-semibold text-ink-2 mb-3 mt-6">Clasificación en este momento</h3>
            <div className="grid grid-cols-1 gap-2 mb-6">
              {cardStandings.map(row => <StandingRow key={row.entry.key} {...row} />)}
            </div>

            {/* Gamificación de esta tarjeta. */}
            {renderGamification(cardGamificationPeople, '')}

            {groupStandings && (
              <>
                <h3 className="font-semibold text-ink-2 mb-3 mt-6">Clasificación general del grupo</h3>
                <div className="grid grid-cols-1 gap-2 mb-6">
                  {groupStandings.map(row => <StandingRow key={row.entry.key} {...row} />)}
                </div>
                {/* Gamificación de todas las tarjetas del grupo de ese día. */}
                {renderGamification(groupGamificationPeople, ' · grupo')}
              </>
            )}

          </div>
        </div>
      </div>

      {showFinalStandings && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowFinalStandings(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="final-standings-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <h2 id="final-standings-title" className="flex items-center gap-2 text-lg font-bold text-ink">
              <Trophy size={20} className="text-amber-500" aria-hidden="true" />
              Clasificación final
            </h2>
            <h3 className="font-semibold text-ink-2 mb-3 mt-4">Clasificación final de la partida</h3>
            <div className="grid grid-cols-1 gap-2">
              {cardStandings.map(row => <StandingRow key={row.entry.key} {...row} />)}
            </div>
            {groupStandings && (
              <>
                <h3 className="font-semibold text-ink-2 mb-3 mt-6">Clasificación general final del grupo</h3>
                <div className="grid grid-cols-1 gap-2">
                  {groupStandings.map(row => <StandingRow key={row.entry.key} {...row} />)}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowFinalStandings(false)}
              className="mt-5 w-full rounded-xl border border-line px-4 py-3 font-semibold text-ink-2"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {showFinishModal && (
        <ConfirmModal
          message={isDecided && !allScoresComplete
            ? '¿Finalizar la partida? Ya está decidida: se guarda el resultado oficial y los hoyos que faltan quedan sin jugar.'
            : '¿Finalizar la partida? Esto marcará la ronda como completada.'}
          onConfirm={handleConfirmFinish}
          onCancel={() => setShowFinishModal(false)}
        />
      )}

      {showPendingScoresModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pending-scores-title"
        >
          <div className="w-full max-w-md rounded-xl bg-card p-6 text-center shadow-card">
            <h2 id="pending-scores-title" className="text-xl font-bold text-ink">
              Hay hoyos pendientes de informar
            </h2>
            <p className="mt-3 text-ink-2">
              Revisa la tabla de golpes antes de finalizar la partida.
            </p>
            <button
              type="button"
              onClick={() => setShowPendingScoresModal(false)}
              autoFocus
              className="mt-6 w-full rounded-lg bg-amber-600 px-4 py-3 font-bold text-amber-950 transition-colors hover:bg-amber-700"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {showCourseChangeModal && courseId && (
        <CourseChangeModal
          currentCourseId={courseId}
          currentCourseName={courseName}
          onSelectCourse={handleSelectCourse}
          onClose={() => setShowCourseChangeModal(false)}
        />
      )}

      {showCourseConfirmModal && selectedCourse && (
        <CourseChangeConfirmModal
          currentCourseName={courseName}
          newCourseName={selectedCourse.name}
          currentNumHoles={numHoles}
          onConfirm={handleConfirmCourseChange}
          onCancel={() => {
            setShowCourseConfirmModal(false);
            setSelectedCourse(null);
          }}
        />
      )}

      {handshakeData && (
        <HandshakeModal
          isOpen={handshakeData.isOpen}
          winnerName={handshakeData.winner}
          marginText={handshakeData.margin}
          gameMode={gameMode}
          canFinish={canFinishRound && !isRoundFinished}
          onFinish={() => {
            setHandshakeAcknowledged(true);
            setHandshakeData(null);
            handleFinishWithConfirm();
          }}
          onContinue={() => {
            setHandshakeAcknowledged(true);
            setHandshakeData(null);
          }}
        />
      )}

      {finalResult && (
        <FinalResultModal result={finalResult} onClose={() => setFinalResult(null)} />
      )}
    </div>
  );
};
