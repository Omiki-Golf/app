import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import { ThemeToggle } from './ThemeToggle';
import React, { useState, useEffect } from 'react';
import { GolfRound, RoundPlayer, RoundScore, Group } from '../types';
import { golfService } from '../services/golfService';
import { ConfirmModal } from './ConfirmModal';
import { AdminPinModal } from './AdminPinModal';
import { RoundStatistics } from './RoundStatistics';
import { adminPinUtils } from '../utils/adminPin';
import { getUserId } from '../utils/userId';
import { Eye, Trash2, Trophy, UserX, UserPlus, TrendingUp, Archive } from 'lucide-react';

const gameModeLabels: Record<string, string> = {
  stableford: 'Stableford',
  match: 'Match Play',
  sindicato: 'Sindicato',
  parejas: 'Parejas',
};

const deletionErrorMessage = (error: unknown, fallback: string): string =>
  error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : fallback;

interface RoundStats {
  round: GolfRound;
  players: RoundPlayer[];
  scores: RoundScore[];
}

interface ActiveRoundsViewerProps {
  onBack: () => void;
  backDestination?: 'back' | 'home';
  onJoinRound: (roundId: string) => void;
  currentGroup?: Group | null;
}

export const ActiveRoundsViewer: React.FC<ActiveRoundsViewerProps> = ({
  onBack, backDestination = 'back',
  onJoinRound,
  currentGroup,
}) => {
  const [rounds, setRounds] = useState<RoundStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [showGlobalLeaderboard, setShowGlobalLeaderboard] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<{ playerId: string; playerName: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [roundToDelete, setRoundToDelete] = useState<string | null>(null);
  const [roundToFinishAndArchive, setRoundToFinishAndArchive] = useState<string | null>(null);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState<string | null>(null);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerHandicap, setNewPlayerHandicap] = useState('');
  const [newPlayerIsGuest, setNewPlayerIsGuest] = useState(false);
  const [canManagePlayers, setCanManagePlayers] = useState(false);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinActionType, setPinActionType] = useState<'deleteAll' | 'deletePlayer' | null>(null);
  const [updatingHandicaps, setUpdatingHandicaps] = useState(false);

  useEffect(() => {
    loadActiveRounds();

    const subscription = golfService.subscribeToRounds((payload: any) => {
      loadActiveRounds();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadActiveRounds = async () => {
    try {
      setLoading(true);
      setError('');
      const activeRounds = await golfService.getActiveRounds();

      const roundsWithDetails = await Promise.all(
        activeRounds.map(async (round) => {
          const players = await golfService.getRoundPlayers(round.id);
          const scores = await golfService.getRoundScores(round.id);
          return { round, players, scores };
        })
      );

      setRounds(roundsWithDetails);
    } catch (err) {
      setError('Error cargando partidas activas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveRoundClick = async (roundId: string) => {
    try {
      setLoading(true);
      setError('');
      const target = rounds.find(item => item.round.id === roundId);
      if (target?.round.group_id) await golfService.archiveRound(roundId);
      else await golfService.archiveQuickPlayRound(roundId);
      await loadActiveRounds();
    } catch (err) {
      setError('Error al archivar la partida');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const firstMissingScore = (roundStats: RoundStats): { playerName: string; holeNumber: number } | null => {
    if (roundStats.players.length === 0) return { playerName: 'ningún jugador', holeNumber: 1 };
    const firstHole = roundStats.round.holes_range === '10-18' ? 10 : 1;
    for (const player of roundStats.players) {
      for (let offset = 0; offset < roundStats.round.num_holes; offset += 1) {
        const holeNumber = firstHole + offset;
        const informed = roundStats.scores.some(score =>
          score.player_id === player.id
          && score.hole_number === holeNumber
          && (score.abandoned === true || score.gross_strokes > 0)
        );
        if (!informed) return { playerName: player.name, holeNumber };
      }
    }
    return null;
  };

  const handleFinishAndArchiveClick = (roundStats: RoundStats) => {
    const missing = firstMissingScore(roundStats);
    if (missing) {
      setError(missing.playerName === 'ningún jugador'
        ? 'No se puede finalizar: la partida todavía no tiene jugadores.'
        : `No se puede finalizar: falta informar a ${missing.playerName} en el hoyo ${missing.holeNumber}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError('');
    setRoundToFinishAndArchive(roundStats.round.id);
  };

  const handleConfirmFinishAndArchive = async () => {
    if (!roundToFinishAndArchive) return;
    const roundId = roundToFinishAndArchive;
    setRoundToFinishAndArchive(null);
    try {
      setLoading(true);
      setError('');
      await golfService.finishExpressRound(roundId);
      await golfService.archiveQuickPlayRound(roundId);
      await loadActiveRounds();
    } catch (err) {
      setError(deletionErrorMessage(err, 'No se pudo finalizar y archivar la partida'));
      await loadActiveRounds();
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllRounds = () => {
    const isDivend = currentGroup?.group_code === 'DIVEND';

    if (isDivend) {
      setPinActionType('deleteAll');
      setShowAdminPinModal(true);
      setPinError('');
      return;
    }

    const currentUserId = getUserId();
    const notOwnedRounds = rounds.filter(r => r.round.user_id !== currentUserId);

    if (notOwnedRounds.length > 0) {
      setError('No tienes permisos para eliminar todas las partidas. Solo puedes eliminar las partidas que has creado.');
      return;
    }

    setShowDeleteAllModal(true);
  };

  const handlePinSubmit = (pin: string) => {
    if (adminPinUtils.verifyPin(pin)) {
      setShowAdminPinModal(false);
      setPinError('');

      if (pinActionType === 'deleteAll') {
        setShowDeleteAllModal(true);
      } else if (pinActionType === 'deletePlayer') {
        setConfirmDelete(false);
      }

      setPinActionType(null);
    } else {
      setPinError('PIN incorrecto. Intenta de nuevo.');
    }
  };

  const handlePinCancel = () => {
    setShowAdminPinModal(false);
    setPinError('');
    setPinActionType(null);

    if (pinActionType === 'deletePlayer') {
      setPlayerToDelete(null);
    }
  };

  const handleConfirmDeleteAll = async () => {
    setShowDeleteAllModal(false);
    try {
      setLoading(true);
      setError('');
      if (currentGroup) {
        await golfService.deleteAllRounds(currentGroup.id);
      } else {
        await golfService.deleteAllRounds();
      }
      await loadActiveRounds();
    } catch (err) {
      setError(deletionErrorMessage(err, 'Error eliminando partidas'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoundClick = (roundId: string) => {
    const currentUserId = getUserId();
    const round = rounds.find(r => r.round.id === roundId);

    if (!round) return;

    if (round.round.user_id !== currentUserId) {
      setError('No tienes permisos para eliminar esta partida. Solo el creador puede eliminarla.');
      return;
    }

    setRoundToDelete(roundId);
  };

  const handleConfirmDeleteRound = async () => {
    if (!roundToDelete) return;

    const roundId = roundToDelete;
    setRoundToDelete(null);

    try {
      setError('');
      await golfService.deleteRound(roundId);
      await loadActiveRounds();
    } catch (err) {
      setError(deletionErrorMessage(err, 'Error eliminando la partida'));
      console.error(err);
    }
  };

  const handleDeletePlayerClick = (playerId: string, playerName: string) => {
    const isDivend = currentGroup?.group_code === 'DIVEND';

    setPlayerToDelete({ playerId, playerName });

    if (isDivend) {
      setPinActionType('deletePlayer');
      setShowAdminPinModal(true);
      setPinError('');
    } else {
      setConfirmDelete(false);
    }
  };

  const handleConfirmDeletePlayer = async () => {
    if (!confirmDelete || !playerToDelete) return;

    try {
      setError('');
      await golfService.removePlayerFromRound(playerToDelete.playerId);
      await loadActiveRounds();
      setPlayerToDelete(null);
      setConfirmDelete(false);
    } catch (err) {
      setError('Error eliminando el jugador');
      console.error(err);
    }
  };

  const handleCancelDeletePlayer = () => {
    setPlayerToDelete(null);
    setConfirmDelete(false);
  };

  const handleAddPlayerClick = async (roundId: string) => {
    try {
      const target = rounds.find(item => item.round.id === roundId);
      const players = await golfService.getAllPlayers(target?.round.group_id || undefined);
      setCanManagePlayers(players.some(player => player.can_manage));
      setNewPlayerIsGuest(false);
      const roundPlayers = await golfService.getRoundPlayers(roundId);
      const roundPlayerIds = roundPlayers.map(p => p.player_id).filter(Boolean);
      const busy = await golfService.getPlayersInActiveRounds(roundId);
      const available = players.filter(p => !roundPlayerIds.includes(p.id) && !busy.includes(p.id));
      setAvailablePlayers(available);
      setShowAddPlayerModal(roundId);
      setSelectedPlayerId('');
      setNewPlayerName('');
      setNewPlayerHandicap('');
    } catch (err) {
      setError('Error cargando jugadores');
      console.error(err);
    }
  };

  const handleConfirmAddPlayer = async () => {
    if (!showAddPlayerModal) return;

    const roundId = showAddPlayerModal;
    const round = rounds.find(r => r.round.id === roundId);
    if (!round) return;

    try {
      setError('');

      if (selectedPlayerId === 'new') {
        if (!newPlayerName.trim() || !newPlayerHandicap.trim()) {
          setError('Por favor ingresa nombre y handicap');
          return;
        }
        const handicap = parseFloat(newPlayerHandicap);
        if (!Number.isFinite(handicap) || handicap < 0 || handicap > (round.round.num_holes === 18 ? 54 : 27)) {
          setError(`El hándicap debe estar entre 0 y ${round.round.num_holes === 18 ? 54 : 27}`);
          return;
        }
        const baseHandicap = round.round.num_holes === 18 ? handicap / 2 : handicap;
        if (round.round.group_id) {
          await golfService.addGroupRoundPlayer(round.round.group_id, roundId, newPlayerName.trim(), baseHandicap, newPlayerIsGuest);
        } else {
          const player = await golfService.getOrCreatePlayer(newPlayerName.trim(), baseHandicap);
          await golfService.addPlayerToRound(roundId, player.name, player.exact_handicap, round.round.use_slope, player.id);
        }
      } else if (selectedPlayerId) {
        const player = availablePlayers.find(p => p.id === selectedPlayerId);
        if (!player) return;
        if (round.round.group_id) await golfService.addGroupRoundPlayer(round.round.group_id, roundId, player.name, player.exact_handicap, player.is_guest ? newPlayerIsGuest : false, player.id);
        else await golfService.addPlayerToRound(roundId, player.name, player.exact_handicap, round.round.use_slope, player.id);
      } else {
        setError('Por favor selecciona o crea un jugador');
        return;
      }

      setShowAddPlayerModal(null);
      await loadActiveRounds();
    } catch (err: any) {
      setError(err.message || 'Error añadiendo jugador');
      console.error(err);
    }
  };

  const handleUpdateHandicaps = async () => {
    try {
      setUpdatingHandicaps(true);
      setError('');

      await golfService.updateHandicapsFromLastRanking();

      await loadActiveRounds();
    } catch (err: any) {
      setError(err.message || 'Error actualizando handicaps');
      console.error(err);
    } finally {
      setUpdatingHandicaps(false);
    }
  };

  const getPlayerStats = (roundStats: RoundStats, playerId: string) => {
    const playerScores = roundStats.scores.filter((s) => s.player_id === playerId);
    const totalPoints = playerScores.reduce((sum, s) => sum + s.stableford_points, 0);
    return {
      scoresEntered: playerScores.length,
      totalPoints,
    };
  };

  const getGlobalLeaderboard = () => {
    const allPlayers: Array<{
      name: string;
      is_guest?: boolean;
      handicap: number;
      totalPoints: number;
      holesPlayed: number;
      roundName: string;
      noPasoRojasHoles: number[];
    }> = [];

    rounds.forEach((roundStats) => {
      roundStats.players.forEach((player) => {
        const stats = getPlayerStats(roundStats, player.id);
        const playerScores = roundStats.scores.filter((s) => s.player_id === player.id);
        const noPasoRojasHoles = playerScores
          .filter((s) => s.no_paso_rojas === true)
          .map((s) => s.hole_number)
          .sort((a, b) => a - b);

        allPlayers.push({
          name: player.name,
          is_guest: player.is_guest,
          handicap: player.playing_handicap,
          totalPoints: stats.totalPoints,
          holesPlayed: stats.scoresEntered,
          roundName: roundStats.round.num_holes === 9 ? '9 Hoyos' : '18 Hoyos',
          noPasoRojasHoles,
        });
      });
    });

    return allPlayers.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return a.handicap - b.handicap;
    });
  };

  const allRoundsCompleted = rounds.length > 0 && rounds.every(r => r.round.status === 'completed');
  const hasCompletedRounds = rounds.some(r => r.round.status === 'completed');

  return (
    <div className="min-h-screen bg-app p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {showGlobalLeaderboard ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <NavigationButton destination="back"
                  onClick={() => setShowGlobalLeaderboard(false)}
                  className="bg-card hover:bg-card-2 text-title font-bold py-2 px-3 rounded-lg flex items-center gap-2 transition-colors"
                />
                <ThemeToggle />
              </div>

              <h1 className="text-3xl font-bold text-title">
                {currentGroup
                  ? `Clasificación ${currentGroup.name || 'del Grupo'}`
                  : 'Clasificación'}
              </h1>

              <div className="w-[5.5rem]"></div>
            </div>

            <div className="bg-card rounded-lg shadow-card p-6">
              <div className="space-y-3">
                {getGlobalLeaderboard().map((player, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg flex items-center justify-between ${
                      index === 0
                        ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-400'
                        : index === 1
                        ? 'bg-card-2 border-2 border-line-2'
                        : index === 2
                        ? 'bg-gradient-to-r from-orange-100 to-orange-50 border-2 border-orange-400'
                        : 'bg-card-2 border border-line'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-full ${
                          index === 0
                            ? 'bg-yellow-400 text-yellow-900'
                            : index === 1
                            ? 'bg-ink-4 text-ink'
                            : index === 2
                            ? 'bg-orange-400 text-orange-900'
                            : 'bg-neutral-hover text-ink-2'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-lg text-ink">{player.name}{player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
                          {player.noPasoRojasHoles.length > 0 && (
                            <div className="flex items-center gap-1">
                              {player.noPasoRojasHoles.map((holeNumber) => (
                                <span
                                  key={holeNumber}
                                  className="bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center"
                                >
                                  {holeNumber}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-ink-3">
                          HCP {player.handicap} • {player.roundName} • {player.holesPlayed} hoyos
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-3xl font-bold ${
                          index === 0
                            ? 'text-yellow-600'
                            : index === 1
                            ? 'text-ink-3'
                            : index === 2
                            ? 'text-orange-600'
                            : 'text-accent-ink'
                        }`}
                      >
                        {player.totalPoints}
                      </p>
                      <p className="text-xs text-ink-3">puntos</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <NavigationButton destination={backDestination}
                    onClick={onBack}
                    className="bg-card hover:bg-card-2 text-title font-bold py-2 px-3 rounded-lg flex items-center gap-2 transition-colors"
                  />
                  <ThemeToggle />
                </div>

                <div className="flex gap-2 flex-wrap">
                  {rounds.length > 0 && (
                    <>
                      <button
                        onClick={() => setShowGlobalLeaderboard(true)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                      >
                        <Trophy size={20} />
                        <span className="hidden sm:inline">
                          Clasificación
                        </span>
                      </button>

                      {currentGroup && hasCompletedRounds && (
                        <WriteButton
                          onClick={handleUpdateHandicaps}
                          disabled={!allRoundsCompleted || updatingHandicaps || loading}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                          title={
                            !allRoundsCompleted
                              ? 'Todas las partidas deben estar finalizadas'
                              : 'Actualiza handicaps según la última clasificación'
                          }
                        >
                          <TrendingUp size={20} />
                          <span className="hidden sm:inline">
                            {updatingHandicaps ? 'Actualizando...' : 'Actualizar HCP'}
                          </span>
                        </WriteButton>
                      )}

                      {currentGroup && (
                        <WriteButton
                          onClick={handleDeleteAllRounds}
                          disabled={loading || updatingHandicaps}
                          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                        >
                          <Trash2 size={20} />
                          <span className="hidden sm:inline">Eliminar Todas</span>
                        </WriteButton>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div>
                <h1 className="text-3xl font-bold text-title">
                  {currentGroup
                    ? `Partidas ${currentGroup.name || 'del Grupo'}`
                    : 'Mi Partida'}
                </h1>
                <p className="text-accent-ink text-sm mt-1">
                  {rounds.length} {rounds.length === 1 ? 'partida' : 'partidas'}
                </p>
              </div>
            </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {loading && rounds.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-ink text-lg">Cargando partidas...</p>
          </div>
        ) : rounds.length === 0 ? (
          <div className="bg-card rounded-lg shadow-card p-8 text-center">
            <p className="text-ink-3 text-lg">No hay partidas activas en este momento</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rounds.map((roundStats) => {
              const isExpanded = !currentGroup || selectedRound === roundStats.round.id;
              const courseHoles = roundStats.round.num_holes === 9 ? '9 Hoyos' : '18 Hoyos';

              const maxHole = roundStats.scores.length > 0
                ? Math.max(...roundStats.scores.map(s => s.hole_number))
                : 0;

              const isCompleted = roundStats.round.status === 'completed';
              const missingScore = !currentGroup && !isCompleted ? firstMissingScore(roundStats) : null;
              const playerLimit = !currentGroup
                ? roundStats.round.game_mode === 'match'
                  ? 2
                  : roundStats.round.game_mode === 'sindicato'
                    ? 3
                    : 4
                : 4;

              return (
                <div key={roundStats.round.id} className="space-y-4">
                  <div className="bg-card rounded-lg shadow-card overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => currentGroup && setSelectedRound(isExpanded ? null : roundStats.round.id)}
                      disabled={!currentGroup}
                      className={`w-full p-4 md:p-6 flex items-center justify-between transition-colors ${currentGroup ? 'hover:bg-card-2' : 'cursor-default'}`}
                    >
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-between flex-wrap gap-2 w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-blue-600 text-white text-sm font-bold px-2.5 py-1 rounded">
                            {roundStats.round.reference_number}
                          </span>
                          <p className="font-bold text-lg text-ink">{courseHoles}</p>
                          <span className="bg-accent-soft text-accent-ink border border-accent-ring text-[10px] sm:text-xs font-bold px-2 py-1 rounded uppercase tracking-wide">
                            {gameModeLabels[roundStats.round.game_mode || 'stableford'] || 'Stableford'}
                          </span>
                          {roundStats.round.status === 'completed' ? (
                            <span className="bg-accent text-on-accent text-xs font-semibold px-2.5 py-1 rounded">
                              FINALIZADA
                            </span>
                          ) : roundStats.round.status === 'archived' ? (
                            <span className="bg-ink-3 text-white text-xs font-semibold px-2.5 py-1 rounded">
                              ARCHIVADA
                            </span>
                          ) : maxHole > 0 ? (
                            <span className="bg-accent-soft text-accent-ink text-xs font-semibold px-2 py-1 rounded">
                              Hoyo {maxHole}
                            </span>
                          ) : null}
                        </div>
                        {currentGroup && <div className="flex items-center gap-1">
                          {isCompleted && (
                            <WriteButton
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveRoundClick(roundStats.round.id);
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                              title="Archivar partida"
                            >
                              <Archive size={16} />
                              <span className="hidden sm:inline">Archivar</span>
                            </WriteButton>
                          )}
                          <WriteButton
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRoundClick(roundStats.round.id);
                            }}
                            className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                            title="Eliminar partida"
                          >
                            <Trash2 size={18} />
                          </WriteButton>
                        </div>}
                      </div>
                      <div className="flex gap-2 text-sm text-ink-3 mt-1 flex-wrap">
                        <span>{roundStats.players.length} {roundStats.players.length === 1 ? 'Jugador' : 'Jugadores'}</span>
                        {roundStats.players.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="font-medium text-accent-ink">
                              {roundStats.players.map(p => p.name).join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-ink-3 mt-1">
                        Iniciada hace {getTimeElapsed(roundStats.round.created_at)}
                      </div>
                    </div>

                    {currentGroup && <Eye className="text-accent-ink" size={24} />}
                  </button>

                  {isExpanded && !isCompleted && (
                    <div className="border-t bg-card-2 p-4 md:p-6 space-y-4">
                      <div>
                        <h3 className="font-bold text-ink mb-3">Clasificación</h3>
                        <div className="space-y-2">
                          {roundStats.players
                            .map((player) => {
                              const stats = getPlayerStats(roundStats, player.id);
                              return {
                                player,
                                stats,
                              };
                            })
                            .sort((a, b) => {
                              if (b.stats.totalPoints !== a.stats.totalPoints) {
                                return b.stats.totalPoints - a.stats.totalPoints;
                              }
                              return a.player.playing_handicap - b.player.playing_handicap;
                            })
                            .map((item, index) => (
                              <div
                                key={item.player.id}
                                className={`p-3 rounded-lg flex items-center justify-between gap-3 ${
                                  index === 0
                                    ? 'bg-yellow-100 dark:bg-yellow-950 border border-yellow-400 dark:border-yellow-700'
                                    : 'bg-card border border-line'
                                }`}
                              >
                                <div className="flex-1">
                                  <p className={`font-semibold ${index === 0 ? 'text-yellow-950 dark:text-yellow-100' : 'text-ink'}`}>{item.player.name}{item.player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
                                  <p className="text-xs text-ink-3">
                                    HCP {item.player.playing_handicap} • {item.stats.scoresEntered} hoyos
                                  </p>
                                </div>
                                <p
                                  className={`text-2xl font-bold ${
                                    index === 0 ? 'text-yellow-600' : 'text-accent-ink'
                                  }`}
                                >
                                  {item.stats.totalPoints}
                                </p>
                                {!(roundStats.round.status === 'completed' && !roundStats.round.group_id) && (
                                  <WriteButton
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeletePlayerClick(item.player.id, item.player.name);
                                    }}
                                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                    title="Eliminar jugador"
                                  >
                                    <UserX size={20} />
                                  </WriteButton>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                        <button
                          onClick={() => {
                            onJoinRound(roundStats.round.id);
                            setSelectedRound(null);
                          }}
                          className="flex-1 bg-accent hover:bg-accent-hover text-on-accent font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <Eye size={20} />
                          {roundStats.round.status === 'completed'
                            ? 'Ver Resultados'
                            : roundStats.players.length === 0
                            ? 'Comenzar Partida'
                            : 'Ver Partida'}
                        </button>

                        {roundStats.players.length < playerLimit && !(roundStats.round.status === 'completed' && !roundStats.round.group_id) && (
                          <WriteButton
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddPlayerClick(roundStats.round.id);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center gap-2"
                          >
                            <UserPlus size={20} />
                            Añadir
                          </WriteButton>
                        )}

                        {!currentGroup && !missingScore && (
                          <WriteButton
                            onClick={() => handleFinishAndArchiveClick(roundStats)}
                            disabled={loading}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <Archive size={20} />
                            Finalizar y archivar
                          </WriteButton>
                        )}

                        {!currentGroup && (
                          <WriteButton
                            onClick={() => handleDeleteRoundClick(roundStats.round.id)}
                            disabled={loading}
                            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <Trash2 size={20} />
                            Eliminar
                          </WriteButton>
                        )}
                      </div>
                    </div>
                  )}

                  {isExpanded && isCompleted && (
                    <div className="border-t bg-card-2 p-4 md:p-6 space-y-4">
                      <div>
                        <h3 className="font-bold text-ink mb-3">Resumen</h3>
                        <div className="space-y-2">
                          {roundStats.players
                            .map((player) => {
                              const stats = getPlayerStats(roundStats, player.id);
                              return {
                                player,
                                stats,
                              };
                            })
                            .sort((a, b) => {
                              if (b.stats.totalPoints !== a.stats.totalPoints) {
                                return b.stats.totalPoints - a.stats.totalPoints;
                              }
                              return a.player.playing_handicap - b.player.playing_handicap;
                            })
                            .slice(0, 3)
                            .map((item, index) => (
                              <div
                                key={item.player.id}
                                className={`p-3 rounded-lg flex items-center justify-between gap-3 ${
                                  index === 0
                                    ? 'bg-yellow-100 border border-yellow-400'
                                    : 'bg-card border border-line'
                                }`}
                              >
                                <div className="flex-1">
                                  <p className="font-semibold text-ink">{item.player.name}{item.player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
                                  <p className="text-xs text-ink-3">
                                    HCP {item.player.playing_handicap}
                                  </p>
                                </div>
                                <p
                                  className={`text-2xl font-bold ${
                                    index === 0 ? 'text-yellow-600' : 'text-accent-ink'
                                  }`}
                                >
                                  {item.stats.totalPoints}
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                        {!currentGroup && (
                          <button
                            onClick={() => {
                              onJoinRound(roundStats.round.id);
                              setSelectedRound(null);
                            }}
                            className="w-full sm:flex-1 bg-accent hover:bg-accent-hover text-on-accent font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <Eye size={20} />
                            Ver Resultados
                          </button>
                        )}
                        <WriteButton
                          onClick={() => handleArchiveRoundClick(roundStats.round.id)}
                          className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <Archive size={20} />
                          Archivar Partida
                        </WriteButton>
                        {currentGroup && (
                          <button
                            onClick={() => {
                              onJoinRound(roundStats.round.id);
                              setSelectedRound(null);
                            }}
                            className="w-full sm:flex-1 bg-accent hover:bg-accent-hover text-on-accent font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <Eye size={20} />
                            Ver Resultados Completos
                          </button>
                        )}
                        {!currentGroup && (
                          <WriteButton
                            onClick={() => handleDeleteRoundClick(roundStats.round.id)}
                            disabled={loading}
                            className="w-full sm:flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <Trash2 size={20} />
                            Eliminar
                          </WriteButton>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>

      {showAdminPinModal && (
        <AdminPinModal
          onSubmit={handlePinSubmit}
          onCancel={handlePinCancel}
          error={pinError}
        />
      )}

      {/* Modal Borrar Todas */}
      {showDeleteAllModal && (
        <ConfirmModal
          message={currentGroup
            ? '¿Estás seguro de que quieres eliminar TODAS las partidas activas o finalizadas de este grupo?'
            : '¿Estás seguro de que quieres eliminar todas tus partidas? La lista se limpiará, pero seguirán contando dentro del cupo consumido del Plan Express.'}
          requiredText={currentGroup ? 'ELIMINAR TODAS' : undefined}
          onConfirm={handleConfirmDeleteAll}
          onCancel={() => setShowDeleteAllModal(false)}
        />
      )}

      {/* Modal Borrar Una Partida */}
      {roundToDelete && (
        <ConfirmModal
          message="¿Seguro que quieres eliminar esta partida? Se quitará de tu lista pero seguirá contando dentro del cupo consumido de tu Plan Express."
          onConfirm={handleConfirmDeleteRound}
          onCancel={() => setRoundToDelete(null)}
        />
      )}

      {roundToFinishAndArchive && (
        <ConfirmModal
          message="¿Finalizar y archivar esta partida? Solo podrás hacerlo si todos los golpes están informados. Después podrás crear una partida nueva."
          onConfirm={handleConfirmFinishAndArchive}
          onCancel={() => setRoundToFinishAndArchive(null)}
        />
      )}

      {playerToDelete && !showAdminPinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-card max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-3 rounded-full">
                <UserX className="text-red-600" size={24} />
              </div>
              <h2 className="text-xl font-bold text-ink">
                Eliminar Jugador
              </h2>
            </div>

            <p className="text-ink-2 mb-4">
              ¿Estás seguro de que quieres eliminar a <strong>{playerToDelete.playerName}</strong> de esta partida?
            </p>

            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded mb-6">
              <p className="text-amber-800 text-sm font-semibold mb-2">
                Esta acción no se puede deshacer
              </p>
              <label className="flex items-center gap-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Confirmo que quiero eliminar este jugador</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancelDeletePlayer}
                className="flex-1 bg-neutral hover:bg-neutral-hover text-ink font-semibold py-3 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <WriteButton
                onClick={handleConfirmDeletePlayer}
                disabled={!confirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Eliminar
              </WriteButton>
            </div>
          </div>
        </div>
      )}

      {showAddPlayerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-card max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-100 p-3 rounded-full">
                <UserPlus className="text-blue-600" size={24} />
              </div>
              <h2 className="text-xl font-bold text-ink">
                Añadir Jugador
              </h2>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-ink-2 mb-2">
                Selecciona un jugador
              </label>
              <select
                value={selectedPlayerId}
                onChange={(e) => { setSelectedPlayerId(e.target.value); setNewPlayerIsGuest(!!availablePlayers.find(player => player.id === e.target.value)?.is_guest); }}
                className="w-full px-3 py-2 border border-line-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Selecciona --</option>
                {availablePlayers.map((player) => (
                  <option key={player.id} value={player.id} disabled={player.handicap_pending}>
                    {player.name}{player.is_guest ? ' · Invitado' : ''} (HCP {(rounds.find(item => item.round.id === showAddPlayerModal)?.round.num_holes === 18 ? 2 : 1) * player.exact_handicap}){player.handicap_pending ? ' · Pendiente' : ''}
                  </option>
                ))}
                <option value="new">+ Crear nuevo jugador</option>
              </select>
            </div>

            {availablePlayers.find(player => player.id === selectedPlayerId)?.is_guest && canManagePlayers && <div className="mb-4">
              <WriteButton type="button" onClick={() => setNewPlayerIsGuest(!newPlayerIsGuest)} className="text-sm text-accent-ink underline">
                {newPlayerIsGuest ? 'Incorporar al grupo' : 'Mantener como invitado'}
              </WriteButton>
              {!newPlayerIsGuest && <p className="text-xs text-ink-3 mt-1">Se incorporará al añadirlo. Las partidas anteriores conservan su condición de invitado.</p>}
            </div>}

            {selectedPlayerId === 'new' && (
              <div className="space-y-3 mb-4 p-3 bg-card-2 rounded-lg">
                {currentGroup && <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink-2">
                    <input type="checkbox" checked={newPlayerIsGuest} onChange={event => setNewPlayerIsGuest(event.target.checked)} />
                    Invitado: solo juega esta partida
                  </label>
                  <p className="text-xs text-ink-3 mt-1">No contará en las estadísticas ni en los ajustes automáticos del grupo si marcas Invitado.</p>
                </div>}

                <div>
                  <label className="block text-sm font-medium text-ink-2 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    className="w-full px-3 py-2 border border-line-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Nombre del jugador"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-2 mb-1">
                    Hándicap Exacto ({rounds.find(item => item.round.id === showAddPlayerModal)?.round.num_holes || 9} hoyos)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newPlayerHandicap}
                    onChange={(e) => setNewPlayerHandicap(e.target.value)}
                    className="w-full px-3 py-2 border border-line-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={`Ej: 7 (para ${rounds.find(item => item.round.id === showAddPlayerModal)?.round.num_holes || 9} hoyos)`}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowAddPlayerModal(null)}
                className="flex-1 bg-neutral hover:bg-neutral-hover text-ink font-semibold py-3 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <WriteButton
                onClick={handleConfirmAddPlayer}
                disabled={!selectedPlayerId}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Añadir
              </WriteButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function getTimeElapsed(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const minutes = Math.floor((now.getTime() - created.getTime()) / 60000);

  if (minutes < 1) return 'Hace segundos';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}
