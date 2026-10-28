import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import { OmikiLoadingScreen } from './OmikiSpinner';
import React, { useState, useEffect } from 'react';
import { Users, Trophy, TrendingUp, ChevronDown, ChevronUp, UserX, History, Edit2, Save, X, User } from 'lucide-react';
import { golfService } from '../services/golfService';
import { HandicapHistoryEntry, Player } from '../types';
import { EditPlayerNameModal } from './EditPlayerNameModal';
import { AdminPinModal } from './AdminPinModal';
import { adminPinUtils } from '../utils/adminPin';
import { GroupMemberList } from './GroupMemberList';

interface DailyStanding {
  playerId: string;
  playerName: string;
  playingHandicap: number;
  totalPoints: number;
  roundId: string;
  noPasoRojasHoles?: number[];
  isGuest?: boolean;
}

interface DailyRanking {
  date: string;
  standings: DailyStanding[];
}

interface GamePointsProps {
  onBack: () => void;
  groupId?: string | null;
  messagesButton?: React.ReactNode;
}

export function GamePoints({ onBack, groupId, messagesButton }: GamePointsProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [dailyRankings, setDailyRankings] = useState<DailyRanking[]>([]);
  const [handicapHistory, setHandicapHistory] = useState<HandicapHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlayers, setShowPlayers] = useState(false);
  const [showHandicapHistory, setShowHandicapHistory] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<{ playerId: string; playerName: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editHandicap, setEditHandicap] = useState<string>('');
  const [editError, setEditError] = useState<string>('');
  const [editingPlayerName, setEditingPlayerName] = useState<Player | null>(null);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<{
    type: 'editName' | 'editHandicap' | 'deletePlayer';
    player: Player;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [playersData, rankingsData, historyData] = await Promise.all([
        golfService.getAllPlayers(),
        golfService.getDailyRankings(),
        golfService.getHandicapHistory(),
      ]);
      setPlayers(playersData.filter(player => !player.auth_user_id));
      setDailyRankings(rankingsData);
      setHandicapHistory(historyData);
    } catch (error) {
      console.error('Error loading game points:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlayerClick = (player: Player) => {
    setPendingAction({ type: 'deletePlayer', player });
    setShowPinModal(true);
    setPinError('');
  };

  const handleConfirmDeletePlayer = async () => {
    if (!confirmDelete || !playerToDelete) return;

    try {
      await golfService.deletePlayer(playerToDelete.playerId);
      await loadData();
      setPlayerToDelete(null);
      setConfirmDelete(false);
    } catch (error) {
      console.error('Error eliminando jugador:', error);
    }
  };

  const handleCancelDeletePlayer = () => {
    setPlayerToDelete(null);
    setConfirmDelete(false);
  };

  const handleEditHandicapClick = (player: Player) => {
    setPendingAction({ type: 'editHandicap', player });
    setShowPinModal(true);
    setPinError('');
  };

  const handleCancelEditHandicap = () => {
    setEditingPlayerId(null);
    setEditHandicap('');
    setEditError('');
  };

  const handleSaveHandicap = async (playerId: string) => {
    try {
      const newHandicap = parseFloat(editHandicap);

      if (isNaN(newHandicap)) {
        setEditError('El handicap debe ser un número válido');
        return;
      }

      if (newHandicap < 0) {
        setEditError('El handicap no puede ser negativo');
        return;
      }

      if (newHandicap > 54) {
        setEditError('El handicap máximo es 54');
        return;
      }

      await golfService.updatePlayerHandicap(playerId, newHandicap);
      await loadData();
      handleCancelEditHandicap();
    } catch (error) {
      console.error('Error actualizando handicap:', error);
      setEditError('Error al actualizar el handicap');
    }
  };

  const handleEditNameClick = (player: Player) => {
    setPendingAction({ type: 'editName', player });
    setShowPinModal(true);
    setPinError('');
  };

  const handleEditNameConfirm = async (newName: string) => {
    if (!editingPlayerName) return;

    try {
      await golfService.updatePlayerName(editingPlayerName.id, newName);
      await loadData();
      setShowEditNameModal(false);
      setEditingPlayerName(null);
    } catch (error) {
      console.error('Error actualizando nombre:', error);
    }
  };

  const handleEditNameCancel = () => {
    setShowEditNameModal(false);
    setEditingPlayerName(null);
  };

  const handlePinSubmit = (pin: string) => {
    if (!adminPinUtils.verifyPin(pin)) {
      setPinError('Código incorrecto');
      return;
    }

    setShowPinModal(false);
    setPinError('');

    if (!pendingAction) return;

    if (pendingAction.type === 'editName') {
      setEditingPlayerName(pendingAction.player);
      setShowEditNameModal(true);
    } else if (pendingAction.type === 'editHandicap') {
      setEditingPlayerId(pendingAction.player.id);
      setEditHandicap((pendingAction.player.exact_handicap_18 ?? pendingAction.player.exact_handicap).toFixed(1));
      setEditError('');
    } else if (pendingAction.type === 'deletePlayer') {
      setPlayerToDelete({ playerId: pendingAction.player.id, playerName: pendingAction.player.name });
      setConfirmDelete(false);
    }

    setPendingAction(null);
  };

  const handlePinCancel = () => {
    setShowPinModal(false);
    setPinError('');
    setPendingAction(null);
  };

  const getColorClass = (index: number, totalPlayers: number): string => {
    if (totalPlayers === 0) return 'bg-card';

    const isOdd = totalPlayers % 2 === 1;

    if (isOdd) {
      const middleIndex = Math.floor(totalPlayers / 2);
      if (index < middleIndex) {
        return 'bg-blue-100 border-blue-300';
      } else if (index === middleIndex) {
        return 'bg-yellow-100 border-yellow-300';
      } else {
        return 'bg-red-100 border-red-300';
      }
    } else {
      const middleIndex = totalPlayers / 2;
      if (index < middleIndex) {
        return 'bg-blue-100 border-blue-300';
      } else {
        return 'bg-red-100 border-red-300';
      }
    }
  };

  const sortStandings = (standings: DailyStanding[]): DailyStanding[] => {
    return [...standings].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return a.playingHandicap - b.playingHandicap;
    });
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const calculateNewHandicap = (
    index: number,
    totalPlayers: number,
    currentHandicap: number
  ): number => {
    const isOdd = totalPlayers % 2 === 1;

    if (isOdd) {
      const middleIndex = Math.floor(totalPlayers / 2);
      if (index < middleIndex) {
        return currentHandicap > 0 ? currentHandicap - 1 : currentHandicap;
      } else if (index === middleIndex) {
        return currentHandicap;
      } else {
        return currentHandicap < 12 ? currentHandicap + 1 : currentHandicap;
      }
    } else {
      const middleIndex = totalPlayers / 2;
      if (index < middleIndex) {
        return currentHandicap > 0 ? currentHandicap - 1 : currentHandicap;
      } else {
        return currentHandicap < 12 ? currentHandicap + 1 : currentHandicap;
      }
    }
  };

  const getHandicapAdjustments = () => {
    if (dailyRankings.length === 0) return [];

    const latestRanking = dailyRankings[0];
    // Los invitados no ajustan hándicap.
    const sortedStandings = sortStandings(latestRanking.standings.filter((standing) => !standing.isGuest));

    return sortedStandings.map((standing, index) => {
      const currentHandicap = standing.playingHandicap;
      const newHandicap = calculateNewHandicap(
        index,
        sortedStandings.length,
        currentHandicap
      );
      const colorClass = getColorClass(index, sortedStandings.length);

      return {
        playerName: standing.playerName,
        currentHandicap,
        newHandicap,
        adjustment: newHandicap - currentHandicap,
        colorClass,
      };
    });
  };

  const handicapAdjustments = getHandicapAdjustments();

  if (loading) {
    return <OmikiLoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-app p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div>
          <TopBar className="mb-3" left={<NavigationButton destination="back" onClick={onBack} aria-label="Volver al grupo" title="Volver al grupo" />} center={messagesButton} />

          <h1 className="text-3xl md:text-4xl font-bold text-title mb-8 text-center">
            Clasificación y jugadores
          </h1>

          <div className="space-y-8">
            <div>
              <div className="flex items-center mb-4">
                <Trophy className="w-6 h-6 mr-2 text-accent-ink" />
                <h2 className="text-2xl font-semibold text-title">
                  Clasificaciones por Día
                </h2>
              </div>

              {dailyRankings.length > 0 && (
                <div className="mb-4 p-3 bg-card-2 rounded-lg border border-line">
                  <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-ink-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-blue-100 border-2 border-blue-300 rounded"></div>
                      <span>Recibe cerveza</span>
                    </div>
                    <span className="text-ink-4">|</span>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-yellow-100 border-2 border-yellow-300 rounded"></div>
                      <span>Ni paga ni recibe</span>
                    </div>
                    <span className="text-ink-4">|</span>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-red-100 border-2 border-red-300 rounded"></div>
                      <span>Paga cerveza</span>
                    </div>
                  </div>
                </div>
              )}

              {dailyRankings.length === 0 ? (
                <p className="text-ink-3 text-center py-4">
                  No hay partidas completadas
                </p>
              ) : (
                <div className="space-y-6">
                  {dailyRankings.map((ranking, rankingIndex) => {
                    const sortedStandings = sortStandings(ranking.standings);
                    const memberStandings = sortedStandings.filter((standing) => !standing.isGuest);
                    return (
                      <div
                        key={rankingIndex}
                        className="bg-card-2 rounded-lg p-5 border border-line"
                      >
                        <h3 className="text-xl font-semibold text-title mb-4 capitalize">
                          {formatDate(ranking.date)}
                        </h3>
                        <div className="space-y-2">
                          {sortedStandings.map((standing, index) => {
                            // El color indica el ajuste de hándicap: solo entre miembros.
                            const colorClass = standing.isGuest
                              ? 'bg-card border-line'
                              : getColorClass(memberStandings.indexOf(standing), memberStandings.length);
                            return (
                              <div
                                key={standing.playerId}
                                className={`${colorClass} border-2 rounded-lg p-4 flex justify-between items-center`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-bold text-lg text-ink-2 w-8">
                                    {index + 1}º
                                  </span>
                                  <span className="font-medium text-ink">
                                    {standing.playerName}
                                    {standing.isGuest && <span className="ml-1 text-xs font-normal text-ink-3">(Invitado)</span>}
                                  </span>
                                  <span className="text-sm text-ink-3">
                                    (HCP juego: {standing.playingHandicap})
                                  </span>
                                  {standing.noPasoRojasHoles && standing.noPasoRojasHoles.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      {standing.noPasoRojasHoles.map((holeNumber) => (
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
                                <span className="text-xl font-bold text-title">
                                  {standing.totalPoints} pts
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {handicapAdjustments.length > 0 && (
              <div>
                <div className="flex items-center mb-4">
                  <TrendingUp className="w-6 h-6 mr-2 text-accent-ink" />
                  <h2 className="text-2xl font-semibold text-title">
                    Nuevo Handicap
                  </h2>
                </div>
                <div className="bg-card-2 rounded-lg p-5 border border-line">
                  <p className="text-sm text-ink-3 mb-4">
                    Basado en la última clasificación:
                  </p>
                  <div className="space-y-2">
                    {handicapAdjustments.map((adjustment) => (
                      <div
                        key={adjustment.playerName}
                        className={`${adjustment.colorClass} border-2 rounded-lg p-4`}
                      >
                        {/* Nombre arriba; debajo, HCP actual y nuevo en dos columnas. */}
                        <p className="font-semibold text-ink break-words mb-2">
                          {adjustment.playerName}
                        </p>
                        <div className="grid grid-cols-2 gap-3 text-center">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-ink-3">HCP actual</p>
                            <p className="text-2xl font-bold text-ink-2">{adjustment.currentHandicap}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-ink-3">HCP nuevo</p>
                            <p className="text-2xl font-bold text-title">
                              {adjustment.newHandicap}
                              {adjustment.adjustment !== 0 && (
                                <span
                                  className={`ml-1 text-sm font-semibold ${
                                    adjustment.adjustment > 0
                                      ? 'text-red-600'
                                      : 'text-blue-600'
                                  }`}
                                >
                                  ({adjustment.adjustment > 0 ? '+' : ''}
                                  {adjustment.adjustment})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {handicapHistory.length > 0 && (
              <div>
                <button
                  onClick={() => setShowHandicapHistory(!showHandicapHistory)}
                  className="flex items-center justify-between w-full mb-4 p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <div className="flex items-center">
                    <History className="w-6 h-6 mr-2 text-blue-700" />
                    <h2 className="text-2xl font-semibold text-blue-900">
                      Histórico de Handicaps
                    </h2>
                  </div>
                  {showHandicapHistory ? (
                    <ChevronUp className="w-6 h-6 text-blue-700" />
                  ) : (
                    <ChevronDown className="w-6 h-6 text-blue-700" />
                  )}
                </button>
                {showHandicapHistory && (
                  <div className="bg-card-2 rounded-lg border border-line overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px]">
                        <thead>
                          <tr className="border-b-2 border-line-2">
                            <th className="text-left py-3 pl-5 pr-4 font-semibold text-ink-2 sticky left-0 bg-card-2 z-20 border-r-2 border-line-2 min-w-[120px] w-[120px]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}>
                              Fecha
                            </th>
                            {handicapHistory.length > 0 &&
                              handicapHistory[0].playerNames.map((playerName: string) => (
                                <th
                                  key={playerName}
                                  className="text-center p-3 font-semibold text-ink-2 min-w-[140px]"
                                >
                                  {playerName}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {handicapHistory.map((entry, index) => (
                            <tr
                              key={entry.date}
                              className={index % 2 === 0 ? 'bg-card' : 'bg-card-2'}
                            >
                              <td className={`py-3 pl-5 pr-4 font-medium text-ink sticky left-0 z-20 border-r border-line min-w-[120px] w-[120px] ${index % 2 === 0 ? 'bg-card' : 'bg-card-2'}`} style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}>
                              {new Date(entry.date).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                              })}
                            </td>
                            {entry.playerNames.map((playerName: string) => {
                              const handicapData = entry.handicaps[playerName];

                              if (!handicapData) {
                                return (
                                  <td key={playerName} className="text-center p-3">
                                    <span className="text-ink-4">-</span>
                                  </td>
                                );
                              }

                              const playingHandicap = handicapData.playingHandicap;
                              const newHandicap = handicapData.newHandicap;
                              const change = newHandicap - playingHandicap;

                              return (
                                <td
                                  key={playerName}
                                  className="text-center p-3"
                                >
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-ink-3">HCP Juego:</span>
                                      <span className="text-sm font-medium text-ink-2">
                                        {playingHandicap.toFixed(1)}
                                      </span>
                                    </div>
                                    {change !== 0 ? (
                                      <div className="flex items-center gap-1">
                                        <span
                                          className={`text-sm font-bold ${
                                            change > 0
                                              ? 'text-red-600'
                                              : 'text-accent-ink'
                                          }`}
                                        >
                                          {change > 0 ? '+' : ''}
                                          {change.toFixed(1)}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-ink-3">
                                        Sin cambio
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-ink-3">Nuevo HCP:</span>
                                      <span className="text-sm font-bold text-blue-700">
                                        {newHandicap.toFixed(1)}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {groupId && <GroupMemberList key={groupId} groupId={groupId} />}
            <div>
              <button
                onClick={() => setShowPlayers(!showPlayers)}
                className="flex items-center justify-between w-full mb-4 p-4 bg-accent-soft hover:bg-accent-soft rounded-lg transition-colors"
              >
                <div className="flex items-center">
                  <Users className="w-6 h-6 mr-2 text-accent-ink" />
                  <h2 className="text-2xl font-semibold text-title">
                    Fichas sin cuenta vinculada
                  </h2>
                  <span className="ml-3 text-sm text-accent-ink font-medium">
                    ({players.length})
                  </span>
                </div>
                {showPlayers ? (
                  <ChevronUp className="w-6 h-6 text-accent-ink" />
                ) : (
                  <ChevronDown className="w-6 h-6 text-accent-ink" />
                )}
              </button>
              {showPlayers && (
                <div className="overflow-x-hidden pr-1">
                  <p className="text-sm text-ink-3 mb-3">Estas fichas se utilizan para jugar y guardar hándicaps e históricos. Aceptar una invitación al grupo no crea una ficha de juego.</p>
                  {players.length === 0 ? (
                    <p className="text-ink-3 text-center py-4">
                      Todavía no hay fichas de jugadores para las partidas
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {[...players].sort((a, b) => (a.exact_handicap_18 ?? a.exact_handicap) - (b.exact_handicap_18 ?? b.exact_handicap)).map((player, index) => (
                        <div
                          key={player.id}
                          className="bg-accent-soft border border-accent-ring rounded-lg p-3"
                        >
                          <div className="flex items-start gap-2">
                            <span className="font-bold text-lg text-accent-ink w-7 flex-shrink-0 mt-0.5">
                              {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1 mb-2">
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  <div className="font-medium text-title truncate">
                                    {player.name}{player.is_guest && <span className="ml-1 text-xs text-ink-3">(Invitado)</span>}
                                  </div>
                                  <button
                                    onClick={() => handleEditNameClick(player)}
                                    className="text-purple-600 hover:bg-purple-50 p-1.5 rounded-lg transition-colors flex-shrink-0"
                                    title="Editar nombre"
                                  >
                                    <User size={16} />
                                  </button>
                                </div>
                                <WriteButton
                                  onClick={() => handleDeletePlayerClick(player)}
                                  className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors flex-shrink-0"
                                  title="Eliminar jugador"
                                >
                                  <UserX size={18} />
                                </WriteButton>
                              </div>
                              {editingPlayerId === player.id ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-accent-ink">HCP:</span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={editHandicap}
                                      onChange={(e) => setEditHandicap(e.target.value)}
                                      className="w-16 px-2 py-1 text-sm border border-accent-ring rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                                      autoFocus
                                    />
                                  </div>
                                  <button
                                    onClick={() => handleSaveHandicap(player.id)}
                                    className="text-accent-ink hover:bg-accent-soft p-1.5 rounded-lg transition-colors"
                                    title="Guardar"
                                  >
                                    <Save size={16} />
                                  </button>
                                  <button
                                    onClick={handleCancelEditHandicap}
                                    className="text-ink-3 hover:bg-card-2 p-1.5 rounded-lg transition-colors"
                                    title="Cancelar"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-accent-ink font-semibold text-sm whitespace-nowrap">
                                    HCP: {(player.exact_handicap_18 ?? player.exact_handicap).toFixed(1)}
                                  </span>
                                  <button
                                    onClick={() => handleEditHandicapClick(player)}
                                    className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors"
                                    title="Editar handicap"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                </div>
                              )}
                              {editingPlayerId === player.id && editError && (
                                <div className="mt-2 text-sm text-red-600">
                                  {editError}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {playerToDelete && (
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
              ¿Estás seguro de que quieres eliminar a <strong>{playerToDelete.playerName}</strong> del registro de jugadores?
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
                <span>Confirmo que quiero eliminar este jugador permanentemente</span>
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

      {showEditNameModal && editingPlayerName && (
        <EditPlayerNameModal
          currentName={editingPlayerName.name}
          onConfirm={handleEditNameConfirm}
          onCancel={handleEditNameCancel}
        />
      )}

      {showPinModal && (
        <AdminPinModal
          onSubmit={handlePinSubmit}
          onCancel={handlePinCancel}
          error={pinError}
        />
      )}
    </div>
  );
}
