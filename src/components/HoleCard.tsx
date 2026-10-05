import React, { useState, useEffect } from 'react';
import { GolfHole, RoundPlayer, RoundScore, GameMode } from '../types';
import { calculateScore, getStrokesReceived, calculateModePoints, ModeScoreInput } from '../utils/calculations';
import { ChevronDown, Trash2, Minus } from 'lucide-react';
import { HoleInOneModal } from './HoleInOneModal';
import { CongratulationsModal } from './CongratulationsModal';

interface HoleCardProps {
  hole: GolfHole;
  players: RoundPlayer[];
  scores: Record<string, RoundScore | undefined>;
  numHoles: 9 | 18;
  allHoles: GolfHole[];
  allHoleScores?: Record<string, Record<number, RoundScore | undefined>>;
  readonly?: boolean;
  groupCode?: string | null;
  gameMode?: GameMode;
  teamAssignments?: Record<string, 0 | 1>;
  onScoreChange: (playerId: string, score: any) => void;
}

const markerColors = [
  'bg-blue-500 border-blue-700',
  'bg-orange-500 border-orange-700',
  'bg-violet-500 border-violet-700',
] as const;

const playerInitials = (name: string) => name
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part[0])
  .join('')
  .slice(0, 2)
  .toLocaleUpperCase('es') || '?';

function CompactPlayer({ name, colorIndex }: { name: string; colorIndex: number }) {
  const safeIndex = Math.max(0, colorIndex) % markerColors.length;
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-black leading-none text-white shadow-sm ${markerColors[safeIndex]}`}
      title={name}
      aria-label={name}
    >
      {playerInitials(name)}
    </span>
  );
}

function ColorMarker({ colorIndex }: { colorIndex: number }) {
  const safeIndex = Math.max(0, colorIndex) % markerColors.length;
  return <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full border-2 shadow-sm ${markerColors[safeIndex]}`} />;
}

export const HoleCard: React.FC<HoleCardProps> = ({
  hole,
  players,
  scores,
  numHoles,
  allHoles,
  readonly = false,
  groupCode = null,
  gameMode = 'stableford',
  teamAssignments = {},
  allHoleScores = {},
  onScoreChange,
}) => {
  const isDivend = groupCode === 'DIVEND';
  const isModeScoring = gameMode !== 'stableford';
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [firstDigit, setFirstDigit] = useState<number | null>(null);
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [showHoleInOneModal, setShowHoleInOneModal] = useState(false);
  const [showCongratulationsModal, setShowCongratulationsModal] = useState(false);
  const [congratsPlayerName, setCongratsPlayerName] = useState('');
  const [pendingNoPasoRojas, setPendingNoPasoRojas] = useState<Record<string, boolean>>({});
  const [pendingSpanishHands, setPendingSpanishHands] = useState<Record<string, boolean>>({});

  const computeModePointsForPlayer = (playerId: string, grossStrokesVal: number, strokesRecv: number, abandonedVal: boolean): number => {
    if (!isModeScoring) return 0;
    const allScores: ModeScoreInput[] = players.map(p => {
      const pscore = scores[p.id];
      if (p.id === playerId) {
        return { playerId: p.id, netStrokes: abandonedVal ? 999 : grossStrokesVal - strokesRecv, abandoned: abandonedVal, entered: true };
      }
      if (!pscore) return { playerId: p.id, netStrokes: 999, abandoned: true, entered: false };
      return { playerId: p.id, netStrokes: pscore.abandoned ? 999 : pscore.net_strokes, abandoned: pscore.abandoned, entered: true };
    });
    return calculateModePoints(gameMode, playerId, allScores, teamAssignments);
  };
  useEffect(() => {
    console.log('🎯 HoleCard: Players prop received:', players.map(p => ({ name: p.name, playing_handicap: p.playing_handicap })));
  }, [players]);

  const getMatchStatus = (): { label: string; leader: string | null; diff: number } => {
    if (!isModeScoring || players.length < 2) return { label: '', leader: null, diff: 0 };
    const totals = players.map((p) => {
      let won = 0;
      let lost = 0;
      let totalPoints = 0;
      for (const h of allHoles) {
        const ps = allHoleScores[p.id]?.[h.hole_number];
        if (ps) {
          totalPoints += ps.mode_points ?? 0;
          const pts = ps.mode_points ?? 0;
          if (pts === 1) won++;
          else if (pts === 0) lost++;
        }
      }
      return { playerId: p.id, name: p.name, won, lost, totalPoints };
    });
    if (gameMode === 'match' && totals.length === 2) {
      const diff = totals[0].won - totals[1].won;
      if (diff > 0) return { label: `${diff}UP`, leader: totals[0].name, diff };
      if (diff < 0) return { label: `${Math.abs(diff)}UP`, leader: totals[1].name, diff };
      return { label: 'AS', leader: null, diff: 0 };
    }
    if (gameMode === 'parejas' && totals.length === 4) {
      const team0 = totals.filter((t) => teamAssignments[t.playerId] === 0);
      const team1 = totals.filter((t) => teamAssignments[t.playerId] === 1);
      // Both players on a team have identical mode_points, so use one player's total per team
      const team0Pts = team0.length > 0 ? team0[0].totalPoints : 0;
      const team1Pts = team1.length > 0 ? team1[0].totalPoints : 0;
      const diff = team0Pts - team1Pts;
      if (diff > 0) return { label: `${diff}UP`, leader: 'Equipo 1', diff };
      if (diff < 0) return { label: `${Math.abs(diff)}UP`, leader: 'Equipo 2', diff };
      const team0Handicap = team0.reduce((sum, player) => {
        const source = players.find(p => p.id === player.playerId);
        return sum + (source?.playing_handicap ?? 0);
      }, 0);
      const team1Handicap = team1.reduce((sum, player) => {
        const source = players.find(p => p.id === player.playerId);
        return sum + (source?.playing_handicap ?? 0);
      }, 0);
      if (team0Handicap < team1Handicap) return { label: 'HCP', leader: 'Equipo 1', diff: 0 };
      if (team1Handicap < team0Handicap) return { label: 'HCP', leader: 'Equipo 2', diff: 0 };
      return { label: 'AS', leader: null, diff: 0 };
    }
    if (gameMode === 'sindicato' && totals.length === 3) {
      const sorted = [...totals].sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        const handicapA = players.find(p => p.id === a.playerId)?.playing_handicap ?? 0;
        const handicapB = players.find(p => p.id === b.playerId)?.playing_handicap ?? 0;
        return handicapA - handicapB;
      });
      const leader = sorted[0];
      return {
        label: `${leader.name}`,
        leader: leader.name,
        diff: sorted[0].totalPoints - sorted[1].totalPoints,
      };
    }
    return { label: '', leader: null, diff: 0 };
  };

  const matchStatus = getMatchStatus();

  const handleToggleExpanded = (playerId: string, isCurrentlyExpanded: boolean) => {
    if (readonly) return;

    if (isCurrentlyExpanded) {
      // Intentando cerrar el desplegable
      if (firstDigit === 1 && pendingPlayerId === playerId) {
        // Hay un "1" pendiente, mostrar modal de confirmación
        setShowHoleInOneModal(true);
        return;
      }
      // No hay dígito pendiente, cerrar normalmente
      setExpandedPlayerId(null);
      setFirstDigit(null);
      setPendingPlayerId(null);
      setPendingNoPasoRojas(prev => {
        const newState = { ...prev };
        delete newState[playerId];
        return newState;
      });
    } else {
      // Abriendo el desplegable
      setExpandedPlayerId(playerId);
      setFirstDigit(null);
      setPendingPlayerId(null);
    }
  };

  const handleNumberClick = (playerId: string, num: number, player: RoundPlayer) => {
    if (firstDigit === 1 && pendingPlayerId === playerId) {
      const twoDigitNumber = 10 + num;
      const newScore = calculateScore(twoDigitNumber, player.playing_handicap, {
        par: hole.par,
        strokeIndex: hole.stroke_index,
      }, numHoles, allHoles);
      if (pendingNoPasoRojas[playerId]) {
        newScore.no_paso_rojas = true;
      }
      newScore.spanish_hands = pendingSpanishHands[playerId] || false;
      newScore.abandoned = false;
      newScore.mode_points = computeModePointsForPlayer(playerId, twoDigitNumber, newScore.strokesReceived, false);
      onScoreChange(playerId, newScore);
      setExpandedPlayerId(null);
      setFirstDigit(null);
      setPendingPlayerId(null);
      setPendingNoPasoRojas(prev => {
        const newState = { ...prev };
        delete newState[playerId];
        return newState;
      });
    } else if (num === 1) {
      // Marcando el 1, esperar segundo dígito
      setFirstDigit(1);
      setPendingPlayerId(playerId);
    } else {
      // Cualquier otro número, registrar y cerrar
      const newScore = calculateScore(num, player.playing_handicap, {
        par: hole.par,
        strokeIndex: hole.stroke_index,
      }, numHoles, allHoles);
      if (pendingNoPasoRojas[playerId]) {
        newScore.no_paso_rojas = true;
      }
      newScore.spanish_hands = pendingSpanishHands[playerId] || false;
      newScore.abandoned = false;
      newScore.mode_points = computeModePointsForPlayer(playerId, num, newScore.strokesReceived, false);
      onScoreChange(playerId, newScore);
      setExpandedPlayerId(null);
      setFirstDigit(null);
      setPendingPlayerId(null);
      setPendingNoPasoRojas(prev => {
        const newState = { ...prev };
        delete newState[playerId];
        return newState;
      });
    }
  };

  const handleConfirmHoleInOne = () => {
    if (pendingPlayerId) {
      const player = players.find(p => p.id === pendingPlayerId);
      if (player) {
        const newScore = calculateScore(1, player.playing_handicap, {
          par: hole.par,
          strokeIndex: hole.stroke_index,
        }, numHoles, allHoles);
        if (pendingNoPasoRojas[pendingPlayerId]) {
          newScore.no_paso_rojas = true;
        }
        newScore.spanish_hands = pendingSpanishHands[pendingPlayerId] || false;
        newScore.abandoned = false;
        newScore.mode_points = computeModePointsForPlayer(pendingPlayerId, 1, newScore.strokesReceived, false);
        onScoreChange(pendingPlayerId, newScore);
        setCongratsPlayerName(player.name);
        setShowCongratulationsModal(true);
      }
    }
    setShowHoleInOneModal(false);
    setExpandedPlayerId(null);
    setFirstDigit(null);
    setPendingPlayerId(null);
    setPendingNoPasoRojas(prev => {
      const newState = { ...prev };
      if (pendingPlayerId) delete newState[pendingPlayerId];
      return newState;
    });
  };

  const handleCancelHoleInOne = () => {
    setShowHoleInOneModal(false);
    // Mantener el desplegable abierto y resetear el primer dígito
    setFirstDigit(null);
  };

  /*const getScoreColor = (points: number): string => {
    if (points >= 3) return 'bg-accent-soft border-accent';
    if (points === 2) return 'bg-red-100 border-red-500';
    if (points === 1) return 'bg-yellow-100 border-yellow-500';
    if (points === 0) return 'bg-card-2 border-black text-black'; // Borde negro y fondo neutro
    if (points === '-') return 'bg-black-100 border-yellow-500';
    return 'bg-blue-100 border-blue-500';
  };*/
const getScoreColor = (points: number, isAbandoned?: boolean): string => {
  if (isAbandoned) return 'bg-black border-line-2 text-white';
  if (points === 0) return 'bg-black border-line-2 text-white';
  if (points === 1) return 'bg-blue-100 dark:bg-blue-950 border-blue-500 text-blue-900 dark:text-blue-200';
  if (points === 2) return 'bg-card border-line-2 text-ink';
  if (points === 3) return 'bg-red-100 dark:bg-red-950 border-red-500 text-red-900 dark:text-red-200';
  if (points >= 4) return 'bg-yellow-100 dark:bg-yellow-950 border-yellow-500 text-yellow-900 dark:text-yellow-200';
  return 'bg-card-2 border-line';
};

  /*const getPointsText = (points: number): string => {
  if (points === 0) return '-';
  if (points >= 5) return `${points}+ pts`;
  return `${points} pts`;
};*/
  const getPointsText = (points: number, isAbandoned?: boolean): string => {
  if (isAbandoned) return '-';
  if (points >= 5) return `${points}+ pts`;
  return `${points} pts`;
};

  return (
    <div className="bg-card rounded-lg shadow-soft border-2 border-line overflow-hidden">
      <div className="bg-accent-deep p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-white">Hoyo {hole.hole_number}</h3>
            <div className="flex gap-4 mt-1 text-on-deep">
              <span className="font-semibold">Par {hole.par}</span>
              <span>HCP {hole.stroke_index}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {players.map((player, playerIndex) => {
          const score = scores[player.id];
          const isExpanded = expandedPlayerId === player.id;
          const isParejas = gameMode === 'parejas' && players.length === 4;
          const team = teamAssignments[player.id] ?? (playerIndex < 2 ? 0 : 1);
          const teamLabel = team === 0 ? 'P1' : 'P2';
          const teamClasses = team === 0
            ? 'border-blue-400 ring-1 ring-blue-100'
            : 'border-orange-400 ring-1 ring-orange-100';

          return (
            <div key={player.id} className={`border-2 rounded-lg overflow-hidden ${isParejas ? teamClasses : 'border-line'}`}>
              <button
                onClick={() => handleToggleExpanded(player.id, isExpanded)}
                disabled={readonly}
                className="w-full bg-card-2 hover:bg-card-2 disabled:cursor-not-allowed p-3 flex items-center justify-between transition-colors"
              >
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    {isModeScoring && <ColorMarker colorIndex={isParejas ? team : playerIndex} />}
                    {isParejas && <span className="sr-only">{teamLabel}</span>}
                    <p className="font-semibold text-ink">{player.name}</p>
                  </div>
                  <p className="text-xs text-ink-3">HCP {player.playing_handicap}</p>
                </div>
                {/* FBP-Ini}
                {score ? (
                  score.abandoned ? (
                    <div className="text-ink-4 font-semibold text-2xl">-</div>
                  ) : (
                    <div className={`px-4 py-2 rounded-lg border-2 font-bold text-lg ${getScoreColor(score.stableford_points)}`}>
                      {getPointsText(score.stableford_points)} pts
                    </div>
                  )
                ) : (
                  <div className="text-ink-4 font-semibold">-</div>
                )}
                {FBP-Fin*/}
                {score ? (
                  (() => {
                    // Es raya si está marcado como abandonado
                    const isRaya = score.abandoned === true;
                    const isParejas = gameMode === 'parejas';
                
                    const displayPoints = isModeScoring ? (score.mode_points ?? 0) : score.stableford_points;
                    const modeText = isRaya
                      ? `${score.gross_strokes}` // Mostrar el gross_strokes (PAR + 2) cuando es raya
                      : isParejas
                      ? `${score.gross_strokes}`
                      : isModeScoring
                      ? `${displayPoints} pts`
                      : getPointsText(score.stableford_points, isRaya);
                    return (
                      <div
                        className={`px-4 py-2 rounded-lg border-2 font-bold text-lg flex items-center justify-center min-w-[75px] relative ${getScoreColor(
                          isParejas ? score.stableford_points : (isModeScoring ? displayPoints : score.stableford_points),
                          isRaya
                        )}`}
                      >
                        {modeText}
                        {isRaya && (
                          <div 
                            className="absolute w-full h-0.5 bg-white/90 opacity-90"
                            style={{ width: '60px', transform: 'rotate(45deg)' }}
                          />
                        )}
                      </div>
                    );
                  })()
                ) : (
                  // Hoyo pendiente / No asignado aún (gris tenue sin marco)
                  <div className="text-ink-4 font-light text-xl px-4 flex items-center justify-center min-w-[75px]">
                    -
                  </div>
                )}
                <ChevronDown
                  size={20}
                  className={`ml-2 text-ink-3 transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isExpanded && (() => {
                const allStrokeIndexes = allHoles.map(h => h.stroke_index);
                const strokesReceived = getStrokesReceived(
                  player.playing_handicap,
                  hole.stroke_index,
                  numHoles,
                  allStrokeIndexes
                );

                return (
                  <div className="bg-card-2 border-t border-line p-3 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-ink-2 mb-2">
                        {firstDigit === 1 && pendingPlayerId === player.id ? (
                          <span className="text-accent-ink">Segundo dígito (1 + ?)</span>
                        ) : (
                          'Número de Golpes'
                        )}
                      </label>

                      <div className="grid grid-cols-5 gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleNumberClick(player.id, num, player)}
                            className={`h-11 rounded-lg font-bold text-lg transition-colors shadow-soft active:scale-95 ${
                              firstDigit === 1 && pendingPlayerId === player.id
                                ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                                : 'bg-accent hover:bg-accent-hover text-on-accent'
                            }`}
                          >
                            {firstDigit === 1 && pendingPlayerId === player.id ? `1${num}` : num}
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() => {
                            const newScore = calculateScore(10, player.playing_handicap, {
                              par: hole.par,
                              strokeIndex: hole.stroke_index,
                            }, numHoles, allHoles);
                            if (pendingNoPasoRojas[player.id]) {
                              newScore.no_paso_rojas = true;
                            }
                            newScore.spanish_hands = pendingSpanishHands[player.id] || false;
                            newScore.abandoned = false;
                            newScore.mode_points = computeModePointsForPlayer(player.id, 10, newScore.strokesReceived, false);
                            onScoreChange(player.id, newScore);
                            setExpandedPlayerId(null);
                            setFirstDigit(null);
                            setPendingPlayerId(null);
                            setPendingNoPasoRojas(prev => {
                              const newState = { ...prev };
                              delete newState[player.id];
                              return newState;
                            });
                          }}
                          className="h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg transition-colors shadow-soft active:scale-95"
                        >
                          10
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const rayaScore = hole.par + strokesReceived + 2; // Par + golpes recibidos + 2
                            const newScore = calculateScore(rayaScore, player.playing_handicap, {
                                par: hole.par,
                                strokeIndex: hole.stroke_index,
                              }, numHoles, allHoles);
                              if (pendingNoPasoRojas[player.id]) {
                                newScore.no_paso_rojas = true;
                              }
                              newScore.spanish_hands = pendingSpanishHands[player.id] || false;
                              newScore.abandoned = true;
                              newScore.stablefordPoints = 0;
                              newScore.mode_points = computeModePointsForPlayer(player.id, rayaScore, newScore.strokesReceived, true);
                              onScoreChange(player.id, newScore);
                            setExpandedPlayerId(null);
                            setFirstDigit(null);
                            setPendingPlayerId(null);
                            setPendingNoPasoRojas(prev => {
                              const newState = { ...prev };
                              delete newState[player.id];
                              return newState;
                            });
                          }}
                          className="h-11 bg-black hover:bg-gray-800 text-white rounded-lg font-bold transition-colors shadow-soft active:scale-95 flex items-center justify-center"
                        >
                          <Minus size={20} />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const newScore = {
                              gross_strokes: 0,
                              strokes_received: strokesReceived,
                              net_strokes: 0,
                              stableford_points: 0,
                              no_paso_rojas: pendingNoPasoRojas[player.id] || false,
                              abandoned: true,
                              mode_points: computeModePointsForPlayer(player.id, 0, strokesReceived, true),
                            };
                            onScoreChange(player.id, newScore);
                            setExpandedPlayerId(null);
                            setFirstDigit(null);
                            setPendingPlayerId(null);
                            setPendingNoPasoRojas(prev => {
                              const newState = { ...prev };
                              delete newState[player.id];
                              return newState;
                            });
                          }}
                          className="h-11 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors shadow-soft active:scale-95 flex items-center justify-center"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="bg-card p-2 rounded-lg border border-line-2">
                      <div className="flex justify-around text-center text-xs">
                        <div>
                          <p className="text-ink-3">Recib.</p>
                          <p className="font-bold text-blue-700">{strokesReceived}</p>
                        </div>
                        <div>
                          <p className="text-ink-3">Brutos</p>
                          <p className="font-bold text-ink">{score?.gross_strokes || 0}</p>
                        </div>
                        <div>
                          <p className="text-ink-3">Netos</p>
                          <p className="font-bold text-accent-ink">
                            {score?.gross_strokes ? (score.gross_strokes - strokesReceived) : 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-ink-3">{isModeScoring ? 'Modal' : 'Puntos'}</p>
                          <p className="font-bold text-accent-ink">{isModeScoring ? (score?.mode_points ?? 0) : (score?.stableford_points || 0)}</p>
                        </div>
                      </div>
                    </div>

                    {isDivend && (
                      <button
                        type="button"
                        onClick={() => {
                          if (score && score.gross_strokes > 0) {
                            const newNoPasoRojas = !score.no_paso_rojas;
                            const updatedScore = {
                              ...score,
                              grossStrokes: score.gross_strokes,
                              strokesReceived: strokesReceived,
                              netStrokes: score.net_strokes,
                              stablefordPoints: score.stableford_points,
                              no_paso_rojas: newNoPasoRojas,
                            };
                            onScoreChange(player.id, updatedScore);
                          } else {
                            setPendingNoPasoRojas(prev => ({
                              ...prev,
                              [player.id]: !prev[player.id]
                            }));
                          }
                        }}
                        className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                          (score?.no_paso_rojas || pendingNoPasoRojas[player.id])
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-neutral hover:bg-neutral-hover text-ink-2'
                        }`}
                      >
                        {(score?.no_paso_rojas || pendingNoPasoRojas[player.id]) ? '✓ No pasó de rojas' : 'Marcar: No pasó de rojas'}
                      </button>
                    )}

                    {groupCode !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          if (score && score.gross_strokes > 0) {
                            onScoreChange(player.id, {
                              ...score,
                              grossStrokes: score.gross_strokes,
                              strokesReceived,
                              netStrokes: score.net_strokes,
                              stablefordPoints: score.stableford_points,
                              spanish_hands: !score.spanish_hands,
                            });
                          } else {
                            setPendingSpanishHands(prev => ({
                              ...prev,
                              [player.id]: !prev[player.id],
                            }));
                          }
                        }}
                        className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                          (score?.spanish_hands || pendingSpanishHands[player.id])
                            ? 'bg-accent hover:bg-accent-hover text-on-accent'
                            : 'bg-neutral hover:bg-neutral-hover text-ink-2'
                        }`}
                      >
                        {(score?.spanish_hands || pendingSpanishHands[player.id])
                          ? '✓ Spanish Hands'
                          : 'Marcar: Spanish Hands'}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {isModeScoring && matchStatus.label && (
        <div className="border-t-2 border-accent-ring bg-accent-soft p-3">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-accent-ink uppercase tracking-wide">Marcador</span>
            </div>
            <div className="flex w-full flex-wrap items-center justify-center gap-2 text-sm sm:w-auto sm:justify-end">
              {gameMode === 'match' && players.map((p, index) => {
                const total = allHoles.reduce((sum, h) => sum + (allHoleScores[p.id]?.[h.hole_number]?.mode_points ?? 0), 0);
                return <React.Fragment key={p.id}>
                  {index > 0 && <span className="font-black text-ink-3">-</span>}
                  <span className="inline-flex items-center gap-1.5"><CompactPlayer name={p.name} colorIndex={index} /><strong className="text-accent-ink">{total}</strong></span>
                </React.Fragment>;
              })}
              {gameMode === 'sindicato' && [...players].sort((a, b) => {
                const totalA = allHoles.reduce((sum, h) => {
                  const ps = allHoleScores[a.id]?.[h.hole_number];
                  return ps ? sum + (ps.mode_points ?? 0) : sum;
                }, 0);
                const totalB = allHoles.reduce((sum, h) => {
                  const ps = allHoleScores[b.id]?.[h.hole_number];
                  return ps ? sum + (ps.mode_points ?? 0) : sum;
                }, 0);
                return totalB - totalA;
              }).map((p) => {
                const total = allHoles.reduce((sum, h) => {
                  const ps = allHoleScores[p.id]?.[h.hole_number];
                  return ps ? sum + (ps.mode_points ?? 0) : sum;
                }, 0);
                const colorIndex = players.findIndex((player) => player.id === p.id);
                return (
                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2 py-1 shadow-sm">
                    <CompactPlayer name={p.name} colorIndex={colorIndex} />
                    <strong className="text-accent-ink">{total}</strong>
                  </span>
                );
              })}
              {gameMode === 'parejas' && players.length === 4 && (() => {
                const teamAssignmentsLocal = Object.fromEntries(players.map((p, i) => [p.id, teamAssignments[p.id] ?? (i < 2 ? 0 : 1)]));
                const team0 = players.filter((p) => teamAssignmentsLocal[p.id] === 0);
                const team1 = players.filter((p) => teamAssignmentsLocal[p.id] === 1);
                // Both players on a team have identical mode_points, so use one player's total per team
                const team0Pts = team0.length > 0 ? allHoles.reduce((s, h) => {
                  const ps = allHoleScores[team0[0].id]?.[h.hole_number];
                  return ps ? s + (ps.mode_points ?? 0) : s;
                }, 0) : 0;
                const team1Pts = team1.length > 0 ? allHoles.reduce((s, h) => {
                  const ps = allHoleScores[team1[0].id]?.[h.hole_number];
                  return ps ? s + (ps.mode_points ?? 0) : s;
                }, 0) : 0;
                return (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 font-bold">
                    {team0.map((p) => <CompactPlayer key={p.id} name={p.name} colorIndex={0} />)}
                    <span className={`px-2 py-0.5 rounded-lg ${team0Pts > team1Pts ? 'bg-accent text-on-accent' : team0Pts < team1Pts ? 'bg-neutral-hover text-ink-3' : 'bg-neutral text-ink-2'}`}>
                      {team0Pts} - {team1Pts}
                    </span>
                    {team1.map((p) => <CompactPlayer key={p.id} name={p.name} colorIndex={1} />)}
                  </div>
                );
              })()}
              {gameMode !== 'match' && gameMode !== 'sindicato' && gameMode !== 'parejas' && (
                <div className={`px-3 py-1 rounded-lg font-bold text-sm ${
                  matchStatus.diff > 0
                    ? 'bg-accent text-on-accent'
                    : matchStatus.diff < 0
                    ? 'bg-ink-4 text-white'
                    : 'bg-neutral text-ink-2'
                }`}>
                  {matchStatus.label}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {showHoleInOneModal && pendingPlayerId && (
        <HoleInOneModal
          playerName={players.find(p => p.id === pendingPlayerId)?.name || ''}
          onConfirm={handleConfirmHoleInOne}
          onCancel={handleCancelHoleInOne}
        />
      )}

      {showCongratulationsModal && (
        <CongratulationsModal
          playerName={congratsPlayerName}
          onClose={() => setShowCongratulationsModal(false)}
        />
      )}
    </div>
  );
};
