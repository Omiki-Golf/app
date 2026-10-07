import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useState, useEffect } from 'react';
import { GolfHole, RoundPlayer, RoundScore, GameMode } from '../types';
import { HoleCard } from './HoleCard';
import { ConfirmModal } from './ConfirmModal';
import { CourseChangeModal } from './CourseChangeModal';
import { CourseChangeConfirmModal } from './CourseChangeConfirmModal';
import { ScoreSymbol } from './ScoreSymbol';
import { golfService } from '../services/golfService';
import { getStrokesReceived, calculateScoreToPar, checkMatchPlayStatus, checkParejasStatus, checkSindicatoStatus } from '../utils/calculations';
import { ChevronLeft, ChevronRight, Trophy, Lock, MapPin, Eye, EyeOff } from 'lucide-react';
import { HandshakeModal } from './HandshakeModal';

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
  currentResponsibleUserId?: string | null;
  courseName?: string;
  groupCode?: string | null;
  gameMode?: GameMode;
  onHoleChange: (holeNumber: number) => void;
  onScoreChange: (playerId: string, holeNumber: number, score: any) => void;
  onShowLeaderboard: () => void;
  onResetGame: () => void;
  backDestination?: 'back' | 'home';
  onFinishRound: () => void;
  onResponsibleChanged?: (userId: string | null) => Promise<void>;
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
  currentResponsibleUserId = null,
  courseName = '',
  groupCode = null,
  gameMode = 'stableford',
  onHoleChange,
  onScoreChange,
  onShowLeaderboard,
  onResetGame, backDestination = 'back',
  onFinishRound,
  onResponsibleChanged,
  onCourseChanged,
  messagesButton,
}) => {
  const isDivend = groupCode === 'DIVEND';
  const isModeScoring = gameMode !== 'stableford';
  const modeLabels: Record<GameMode, string> = {
    stableford: 'Stableford',
    match: 'Match Play',
    sindicato: 'Sindicato',
    parejas: 'Parejas',
  };
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [participants, setParticipants] = useState<Array<{ user_id: string; label: string; joined_at: string }>>([]);
  const [savingResponsible, setSavingResponsible] = useState(false);

  useEffect(() => {
    if (!isCreator || !roundId || groupCode) return;
    let live = true;
    const load = async () => {
      try {
        const joined = await golfService.getExpressRoundParticipants(roundId);
        if (live) setParticipants(joined);
      } catch (err) {
        console.error('Error cargando participantes Express:', err);
      }
    };
    void load();
    const timer = window.setInterval(load, 15000);
    return () => { live = false; window.clearInterval(timer); };
  }, [isCreator, roundId, groupCode]);

  const handleResponsibleChange = async (userId: string) => {
    if (!onResponsibleChanged) return;
    setSavingResponsible(true);
    setError('');
    try {
      await onResponsibleChanged(userId || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo designar al responsable');
    } finally {
      setSavingResponsible(false);
    }
  };

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
  const roundsMap = new Map(rounds.map((r) => [r.playerId, r]));

  const allScoresComplete = players.every((player) => {
    const round = roundsMap.get(player.id);
    return playableHoles.every((h) => round?.scores[h.hole_number]);
  });

  const isLastHole = currentHole === playableHoles.length;

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

  useEffect(() => {
    setHandshakeAcknowledged(false);
    setHandshakeData(null);
  }, [roundId, gameMode]);

  useEffect(() => {
    if (handshakeAcknowledged) return;

    if (gameMode === 'match') {
      const result = checkMatchPlayStatus(roundsMap, players, playableHoles);
      if (result.isFinished && !handshakeData?.isOpen) {
        setHandshakeData({ isOpen: true, winner: result.leaderName, margin: result.marginText });
      }
    } else if (gameMode === 'parejas') {
      const result = checkParejasStatus(roundsMap, players, playableHoles);
      if (result.isFinished && !handshakeData?.isOpen) {
        setHandshakeData({ isOpen: true, winner: result.leaderName, margin: result.marginText });
      }
    } else if (gameMode === 'sindicato') {
      const result = checkSindicatoStatus(roundsMap, players, playableHoles);
      if (result.isFinished && !handshakeData?.isOpen) {
        setHandshakeData({ isOpen: true, winner: result.leaderName, margin: result.marginText });
      }
    }
  }, [rounds, players, gameMode, handshakeAcknowledged]);

  return (
    <div className="min-h-screen bg-app p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-card rounded-lg shadow-card p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <NavigationButton destination={backDestination}
              onClick={onResetGame}
              className="bg-neutral hover:bg-neutral-hover text-ink p-2 rounded-lg transition-colors"
            />
            <h1 className="flex-1 text-center text-lg font-bold text-title sm:text-2xl md:text-3xl">
              <span className="sm:hidden">Tarjeta</span><span className="hidden sm:inline">Tarjeta de Puntuación</span>
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              {messagesButton}
              <button
                onClick={onShowLeaderboard}
                className="bg-accent hover:bg-accent-hover text-on-accent px-3 sm:px-4 py-2 rounded-lg flex h-11 items-center gap-2 font-semibold transition-colors"
              >
                <Trophy size={20} />
                <span className="hidden sm:inline">Clasificación</span>
              </button>
            </div>
          </div>

          <div className="mb-4 bg-accent rounded-lg p-4 text-on-accent">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold">{courseName || 'Campo de Golf'}</span>
                  {hasEditAccess && onCourseChanged && roundId && courseId && (
                    <WriteButton
                      onClick={() => setShowCourseChangeModal(true)}
                      disabled={changingCourse}
                      className="bg-black/10 hover:bg-black/20 text-on-accent text-xs px-2 py-1 rounded-md flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Cambiar campo de golf"
                    >
                      <MapPin size={12} />
                      Cambiar
                    </WriteButton>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-on-accent/90">
                  <span>Hoyo {currentHole} de {numHoles}</span>
                  <span aria-hidden="true">·</span>
                  <span className="bg-black/10 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide leading-4">
                    {modeLabels[gameMode]}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {accessCode && hasEditAccess && (
            <div className="mb-4 bg-card border-2 border-accent-ring rounded-lg p-4 shadow-soft">
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="text-accent-ink" size={20} />
                  <span className="text-sm font-medium text-ink-2">
                    Código de Acceso:
                  </span>
                  <code className="text-2xl font-bold text-accent-ink tracking-[0.5em] ml-2">
                    {showAccessCode ? accessCode : <span className="text-base">••••</span>}
                  </code>
                </div>
                <button
                  onClick={() => setShowAccessCode(!showAccessCode)}
                  className="p-2 hover:bg-accent-soft rounded-lg transition-colors"
                  aria-label={showAccessCode ? 'Ocultar código' : 'Mostrar código'}
                >
                  {showAccessCode ? (
                    <EyeOff className="text-accent-ink" size={20} />
                  ) : (
                    <Eye className="text-accent-ink" size={20} />
                  )}
                </button>
              </div>
              <p className="text-xs text-ink-3 mt-2">
                Comparte este código con otros jugadores para que puedan ver y editar puntuaciones
              </p>
            </div>
          )}

          {isCreator && !groupCode && participants.length > 0 && (
            <div className="mb-4 bg-card border border-line rounded-lg p-4 shadow-soft">
              <label htmlFor="express-responsible" className="block text-sm font-semibold text-ink mb-2">
                Responsable de finalizar
              </label>
              <select
                id="express-responsible"
                value={currentResponsibleUserId || ''}
                onChange={(event) => void handleResponsibleChange(event.target.value)}
                disabled={savingResponsible}
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-ink disabled:opacity-50"
              >
                <option value="">Solo yo (creador)</option>
                {participants.map((participant) => (
                  <option key={participant.user_id} value={participant.user_id}>{participant.label}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-ink-3">
                El responsable podrá finalizar mientras la partida esté activa. Después, solo tú podrás consultar sus estadísticas.
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
                <Lock className="text-amber-600" size={20} />
                <span className="text-sm font-medium text-amber-900">
                  Solo lectura - No tienes permiso para editar esta partida
                </span>
              </div>
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
                readonly={!hasEditAccess}
                groupCode={groupCode}
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
                Hoyo {currentHole} de {playableHoles.length}
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

            {isLastHole && allScoresComplete && canFinishRound ? (
              <WriteButton
                onClick={handleFinishWithConfirm}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Trophy size={20} />
                Finalizar Partida
              </WriteButton>
            ) : (
              <button
                onClick={() => onHoleChange(Math.min(playableHoles.length, currentHole + 1))}
                disabled={currentHole === playableHoles.length}
                className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-on-accent font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                Siguiente
                <ChevronRight size={20} />
              </button>
            )}
          </div>

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
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${players.indexOf(player) < 2 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                                {players.indexOf(player) < 2 ? 'P1' : 'P2'}
                              </span>
                            )}
                            <span className="truncate">{player.name}{player.is_guest && <span className="ml-1 text-xs font-normal text-ink-3">(Invitado)</span>}</span>
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
                                h.hole_number === currentHole ? 'bg-accent-soft font-bold' : ''
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
                                      <span
                                        className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-red-600 shadow-soft"
                                        title={`No pasó de rojas · Hoyo ${h.hole_number}`}
                                        aria-label={`No pasó de rojas en el hoyo ${h.hole_number}`}
                                      />
                                    )}
                                    {score.spanish_hands && (
                                      <span
                                        className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500 shadow-soft"
                                        title={`Spanish Hands · Hoyo ${h.hole_number}`}
                                        aria-label={`Spanish Hands en el hoyo ${h.hole_number}`}
                                      />
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
                      <td className="p-2 font-bold text-accent-ink text-xs uppercase tracking-wide">Marcador</td>
                      {playableHoles.map((h) => {
                        const holeScores = players.map((p) => {
                          const s = roundsMap.get(p.id)?.scores[h.hole_number];
                          return s ? s.mode_points ?? 0 : null;
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
                          const diff = (holeScores[0] ?? 0) - (holeScores[1] ?? 0);
                          const label = diff > 0 ? `${players[0].name.slice(0, 3).toUpperCase()}` : diff < 0 ? `${players[1].name.slice(0, 3).toUpperCase()}` : 'AS';
                          const color = diff > 0 ? 'bg-emerald-200 text-title' : diff < 0 ? 'bg-neutral text-ink-2' : 'bg-card-2 text-ink-3';
                          return (
                            <td key={h.hole_number} className="text-center p-1">
                              <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${color}`}>{label}</span>
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
                              return s ? s.mode_points ?? 0 : null;
                            });
                            if (ps.every((v) => v !== null)) {
                              const allRaya = scoresForHole.every(s => s?.abandoned);
                              t0Accum += allRaya ? 0.5 : (ps[0] ?? 0);
                              t1Accum += allRaya ? 0.5 : (ps[2] ?? 0);
                            }
                          });
                          const label = `${t0Accum}-${t1Accum}`;
                          const color = t0Accum > t1Accum ? 'bg-emerald-200 text-title' : t0Accum < t1Accum ? 'bg-neutral text-ink-2' : 'bg-card-2 text-ink-3';
                          return (
                            <td key={h.hole_number} className="text-center p-1">
                              <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${color}`}>{label}</span>
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
                            const color = diff > 0 ? 'bg-accent text-on-accent' : diff < 0 ? 'bg-gray-500 text-white' : 'bg-neutral text-ink-2';
                            return <span className={`text-xs font-bold px-2 py-1 rounded ${color}`}>{label}</span>;
                          }
                          if (gameMode === 'parejas' && players.length === 4) {
                            let t0 = 0, t1 = 0;
                            playableHoles.forEach((h) => {
                              const scoresForHole = players.map(p =>
                                roundsMap.get(p.id)?.scores[h.hole_number]
                              );
                              if (scoresForHole.every(Boolean)) {
                                const allRaya = scoresForHole.every(s => s?.abandoned);
                                t0 += allRaya ? 0.5 : (scoresForHole[0]?.mode_points ?? 0);
                                t1 += allRaya ? 0.5 : (scoresForHole[2]?.mode_points ?? 0);
                              }
                            });
                            const label = `${t0}-${t1}`;
                            const color = t0 > t1 ? 'bg-accent text-on-accent' : t0 < t1 ? 'bg-gray-500 text-white' : 'bg-neutral text-ink-2';
                            return <span className={`text-xs font-bold px-2 py-1 rounded ${color}`}>{label}</span>;
                          }
                          return <span className="text-ink-4 text-xs">-</span>;
                        })()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-ink-3">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 border border-line-2"></div>
                <span>Eagle</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-red-500 border border-line-2"></div>
                <span>Birdie</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-card border-2 border-line-2"></div>
                <span>Par</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-blue-500 border border-line-2"></div>
                <span>Bogey</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-black border border-line-2"></div>
                <span>Doble bogey+</span>
              </div>
            </div>

            <h3 className="font-semibold text-ink-2 mb-3 mt-6">Resumen de Puntos Stableford</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {players.map((player) => {
                const round = roundsMap.get(player.id);
                const totalPoints = round?.totalStablefordPoints ?? 0;
                const hasAbandonedScores = false;

                const totalGrossStrokes = playableHoles.reduce((sum, h) => {
                  const score = round?.scores[h.hole_number];
                  if (!score?.gross_strokes) return sum;
                  return sum + (score?.gross_strokes || 0);
                }, 0);

                const coursePar = playableHoles.reduce((sum, h) => sum + h.par, 0);
                const scoreToPar = totalGrossStrokes > 0
                  ? calculateScoreToPar(totalGrossStrokes, coursePar, player.playing_handicap, numHoles)
                  : null;

                return (
                  <div
                    key={player.id}
                    className={`border-2 rounded-lg p-3 text-center ${
                      hasAbandonedScores
                        ? 'bg-card-2 border-line-2'
                        : 'bg-accent-soft border-accent-ring'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {gameMode === 'parejas' && players.length === 4 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${players.indexOf(player) < 2 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                          {players.indexOf(player) < 2 ? 'P1' : 'P2'}
                        </span>
                      )}
                      <p className="text-sm font-semibold text-ink truncate">{player.name}{player.is_guest && <span className="ml-1 text-xs font-normal text-ink-3">(Invitado)</span>}</p>
                    </div>
                    {hasAbandonedScores ? (
                      <>
                        <p className="text-2xl font-bold text-ink-4">-</p>
                        <p className="text-xs text-ink-3">Abandonado</p>
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-accent-ink">{totalPoints}</p>
                        <p className="text-xs text-ink-3">Puntos Stableford</p>
                        {scoreToPar && (
                          <div className="mt-2 pt-2 border-t border-accent-ring">
                            <p className={`text-xl font-bold ${
                              scoreToPar.value === 0 ? 'text-ink-2' :
                              scoreToPar.value < 0 ? 'text-accent-ink' :
                              'text-red-600'
                            }`}>
                              {scoreToPar.display}
                            </p>
                            <p className="text-xs text-ink-3">vs Par Personal</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {isDivend && (
              <>
                <h3 className="font-semibold text-ink-2 mb-3 mt-6">No pasó de rojas</h3>
                <div className="space-y-3">
                  {players.map((player) => {
                    const round = roundsMap.get(player.id);
                    const noPasoRojasHoles: number[] = [];

                    playableHoles.forEach((h) => {
                      const score = round?.scores[h.hole_number];
                      if (score?.no_paso_rojas) {
                        noPasoRojasHoles.push(h.hole_number);
                      }
                    });

                    const noPasoRojasCount = noPasoRojasHoles.length;
                    const holesList = noPasoRojasHoles.length > 0
                      ? `Hoyo: ${noPasoRojasHoles.join(', ')}`
                      : 'Ninguno';

                    return (
                      <div
                        key={player.id}
                        className="bg-red-50 border-2 border-red-200 rounded-lg p-3 flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {gameMode === 'parejas' && players.length === 4 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${players.indexOf(player) < 2 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                                {players.indexOf(player) < 2 ? 'P1' : 'P2'}
                              </span>
                            )}
                            <p className="font-semibold text-ink">{player.name}{player.is_guest && <span className="ml-1 text-xs font-normal text-ink-3">(Invitado)</span>}</p>
                          </div>
                          <p className="text-xs text-ink-3">{holesList}</p>
                        </div>
                        <div className="bg-red-100 border-2 border-red-300 rounded-lg px-4 py-2 min-w-[60px] text-center">
                          <p className="text-2xl font-bold text-red-600">{noPasoRojasCount}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {groupCode !== null && (
              <>
                <h3 className="font-semibold text-ink-2 mb-3 mt-6">Spanish Hands</h3>
                <div className="space-y-3">
                  {players.map((player) => {
                    const playerRound = roundsMap.get(player.id);
                    const spanishHandsHoles = playableHoles
                      .filter(h => playerRound?.scores[h.hole_number]?.spanish_hands)
                      .map(h => h.hole_number);
                    return (
                      <div key={player.id} className="bg-accent-soft border-2 border-accent-ring rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-ink">{player.name}{player.is_guest && <span className="ml-1 text-xs font-normal text-ink-3">(Invitado)</span>}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {spanishHandsHoles.length > 0
                              ? spanishHandsHoles.map(holeNumber => (
                                  <span key={holeNumber} className="bg-accent text-on-accent text-xs font-bold rounded-full px-2 py-0.5">
                                    Hoyo {holeNumber}
                                  </span>
                                ))
                              : <span className="text-xs text-ink-3">Ninguno</span>}
                          </div>
                        </div>
                        <div className="bg-accent-soft border-2 border-accent-ring rounded-lg px-4 py-2 min-w-[60px] text-center">
                          <p className="text-2xl font-bold text-accent-ink">{spanishHandsHoles.length}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      {showFinishModal && (
        <ConfirmModal
          message="¿Finalizar la partida? Esto marcará la ronda como completada."
          onConfirm={handleConfirmFinish}
          onCancel={() => setShowFinishModal(false)}
        />
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
          onContinue={() => {
            setHandshakeAcknowledged(true);
            setHandshakeData(null);
          }}
          onFinishRound={canFinishRound ? onFinishRound : undefined}
        />
      )}
    </div>
  );
};
