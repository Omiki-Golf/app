import { WriteButton, WriteForm } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useState, useEffect, useRef } from 'react';
import { RoundPlayer, Player, GameMode } from '../types';
import { calculatePlayingHandicap } from '../utils/calculations';
import { useAuth } from '../context/AuthContext';
import { golfService } from '../services/golfService';
import { Trash2, Plus, Settings, ChevronDown, Lock, Eye, EyeOff, CreditCard as Edit2 } from 'lucide-react';
import { HolesRangeModal } from './HolesRangeModal';
import { AdminPinModal } from './AdminPinModal';
import { EditPlayerNameModal } from './EditPlayerNameModal';
import { adminPinUtils } from '../utils/adminPin';

interface PlayerSetupProps {
  roundId: string;
  players: RoundPlayer[];
  useSlope: boolean;
  numHoles: 9 | 18;
  courseId: string;
  accessCode?: string;
  hasEditAccess?: boolean;
  currentGroup?: any;
  gameMode?: GameMode;
  onPlayersUpdated: (players: RoundPlayer[]) => void;
  onStartRound: () => void;
  onOpenHoleConfig: () => void;
  onHolesChanged?: (numHoles: 9 | 18, holes: any[]) => void;
  onBack?: () => void;
  backDestination?: 'back' | 'home';
  loading?: boolean;
}

export const PlayerSetup: React.FC<PlayerSetupProps> = ({
  roundId,
  players,
  useSlope,
  numHoles,
  courseId,
  accessCode,
  hasEditAccess = true,
  currentGroup,
  gameMode = 'stableford',
  onPlayersUpdated,
  onStartRound,
  onOpenHoleConfig,
  onHolesChanged,
  onBack, backDestination = 'back',
  loading = false,
}) => {
  const { user } = useAuth();
  const playerLoadVersion = useRef(0);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [playersInActiveRounds, setPlayersInActiveRounds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [creatingUnlinked, setCreatingUnlinked] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [handicap, setHandicap] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [changingHoles, setChangingHoles] = useState(false);
  const [courseHoleCount, setCourseHoleCount] = useState<number>(18);
  const [showHolesRangeModal, setShowHolesRangeModal] = useState(false);
  const [pendingNumHoles, setPendingNumHoles] = useState<9 | 18 | null>(null);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [pinError, setPinError] = useState('');
  const [currentSlope, setCurrentSlope] = useState<number>(113);
  const [isManualSlope, setIsManualSlope] = useState(false);
  const [teeName, setTeeName] = useState<string>('');
  const [editingSlope, setEditingSlope] = useState(false);
  const [tempSlope, setTempSlope] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [showEditPlayerModal, setShowEditPlayerModal] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) void loadPlayers(); };
    refresh();
    void loadSlope();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { active = false; playerLoadVersion.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [roundId, currentGroup?.id, user?.id]);

  useEffect(() => {
    const loadCourseDetails = async () => {
      try {
        const holeCount = await golfService.getCourseHoleCount(courseId);
        setCourseHoleCount(holeCount);
      } catch (err) {
        console.error('Error loading course details:', err);
      }
    };

    loadCourseDetails();
  }, [courseId]);

  useEffect(() => {
    loadSlope();
  }, [roundId, numHoles]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.player-search-container')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadPlayers = async () => {
    const request = ++playerLoadVersion.current;
    try {
      let allPlayersData: Player[] = [];

      if (currentGroup) {
        allPlayersData = await golfService.getAllPlayers(currentGroup.id);
      } else {
        const localPlayers = localStorage.getItem('quickPlayPlayers');
        if (localPlayers) {
          allPlayersData = JSON.parse(localPlayers);
        }
      }

      const playersInRounds = await golfService.getPlayersInActiveRounds(roundId);
      if (request !== playerLoadVersion.current) return;
      setAllPlayers(allPlayersData);
      setCanManage(allPlayersData.some(player => player.can_manage));
      setPlayersInActiveRounds(playersInRounds);
    } catch (err) {
      console.error('Error loading players:', err);
    }
  };

  const loadSlope = async () => {
    if (!useSlope) return;

    try {
      const slopeInfo = await golfService.getRoundSlope(roundId);
      if (slopeInfo) {
        setCurrentSlope(slopeInfo.slope);
        setIsManualSlope(slopeInfo.isManual);
        setTeeName(slopeInfo.teeName || '');
      }
    } catch (err) {
      console.error('Error loading slope:', err);
    }
  };

  const handleEditSlope = () => {
    setTempSlope(currentSlope.toString());
    setEditingSlope(true);
  };

  const handleSaveSlope = async () => {
    const newSlope = parseInt(tempSlope, 10);
    if (isNaN(newSlope) || newSlope < 55 || newSlope > 155) {
      setError('El slope debe estar entre 55 y 155');
      return;
    }

    try {
      await golfService.updateRoundSlope(roundId, newSlope);
      setCurrentSlope(newSlope);
      setIsManualSlope(true);
      setEditingSlope(false);
      setError('');
    } catch (err) {
      console.error('Error updating slope:', err);
      setError('Error actualizando slope');
    }
  };

  const handleCancelEditSlope = () => {
    setEditingSlope(false);
    setTempSlope('');
    setError('');
  };

  const handleResetSlope = async () => {
    try {
      await golfService.updateRoundSlope(roundId, null);
      await loadSlope();
      setEditingSlope(false);
      setError('');
    } catch (err) {
      console.error('Error resetting slope:', err);
      setError('Error restableciendo slope');
    }
  };

  const playersInThisRound = players.map(p => p.player_id).filter(Boolean);

  const filteredPlayers = allPlayers.filter((player) => {
    const matchesSearch = player.name.toLowerCase().includes(searchTerm.toLowerCase());
    const isInThisRound = playersInThisRound.includes(player.id);
    const isInOtherRound = playersInActiveRounds.includes(player.id);
    return matchesSearch && !isInThisRound && !isInOtherRound;
  });

  const handleSelectPlayer = (player: Player) => {
    setCreatingUnlinked(false);
    setSelectedPlayer(player);
    setIsGuest(!!player.is_guest);
    setSearchTerm(player.name);
    const baseHandicap = player.exact_handicap_18 ?? player.exact_handicap;
    const displayHandicap = numHoles === 18 ? baseHandicap * 2 : baseHandicap;
    setHandicap(player.handicap_pending ? '' : displayHandicap.toString());
    setShowDropdown(false);
  };

  const handleSearchChange = (value: string) => {
    setIsGuest(false);
    setCreatingUnlinked(false);
    setSearchTerm(value);
    setSelectedPlayer(null);
    setShowDropdown(true);
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!searchTerm.trim()) {
      setError('El nombre del jugador es requerido');
      return;
    }

    if (currentGroup && !selectedPlayer && !creatingUnlinked && allPlayers.some(player => player.auth_user_id && player.name.toLowerCase() === searchTerm.trim().toLowerCase())) {
      setError('Selecciona al miembro de la lista. Para otro jugador sin cuenta, elige expresamente Crear ficha sin cuenta vinculada.');
      setShowDropdown(true);
      return;
    }
    const handicapNum = parseFloat(handicap);
    if (!Number.isFinite(handicapNum) || handicapNum < 0 || handicapNum > (numHoles === 18 ? 54 : 27)) {
      setError(`El hándicap debe estar entre 0 y ${numHoles === 18 ? 54 : 27}`);
      return;
    }

    try {
      setAdding(true);

      const handicapFor9Holes = numHoles === 18 ? handicapNum / 2 : handicapNum;
      const playerName = searchTerm.trim();

      let newPlayer: RoundPlayer;
      if (currentGroup) {
        newPlayer = await golfService.addGroupRoundPlayer(currentGroup.id, roundId, playerName, handicapFor9Holes, isGuest, selectedPlayer?.id);
      } else {
        const localPlayers = localStorage.getItem('quickPlayPlayers');
        const playersArray: Player[] = localPlayers ? JSON.parse(localPlayers) : [];

        const existingPlayer = playersArray.find(p => p.name === playerName);
        if (existingPlayer) {
          existingPlayer.exact_handicap = handicapFor9Holes;
          existingPlayer.exact_handicap_18 = handicapFor9Holes;
        } else {
          playersArray.push({
            id: crypto.randomUUID(),
            name: playerName,
            exact_handicap: handicapFor9Holes,
            exact_handicap_18: handicapFor9Holes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }

        localStorage.setItem('quickPlayPlayers', JSON.stringify(playersArray));
        newPlayer = await golfService.addPlayerToRound(roundId, playerName, handicapFor9Holes, useSlope);
      }

      onPlayersUpdated([...players, newPlayer]);

      await loadPlayers();

      setSearchTerm('');
      setCreatingUnlinked(false);
      setIsGuest(false);
      setHandicap('');
      setSelectedPlayer(null);
      setShowDropdown(false);
    } catch (err) {
      setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Error añadiendo jugador');
      console.error(err);
    } finally {
      setAdding(false);
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    try {
      await golfService.removePlayerFromRound(playerId);
      onPlayersUpdated(players.filter((p) => p.id !== playerId));
      await loadPlayers();
    } catch (err) {
      console.error('Error removing player:', err);
    }
  };

  const handleDeletePlayerFromMemory = async (playerId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      if (currentGroup) {
        await golfService.deletePlayer(playerId);
      } else {
        const localPlayers = localStorage.getItem('quickPlayPlayers');
        if (localPlayers) {
          const playersArray: Player[] = JSON.parse(localPlayers);
          const filteredPlayers = playersArray.filter(p => p.id !== playerId);
          localStorage.setItem('quickPlayPlayers', JSON.stringify(filteredPlayers));
        }
      }
      await loadPlayers();
    } catch (err) {
      console.error('Error deleting player:', err);
      setError('Error eliminando jugador de la memoria');
    }
  };

  const handleChangeHoles = async (newNumHoles: 9 | 18) => {
    if (!onHolesChanged) return;

    if (newNumHoles === 9 && courseHoleCount === 18) {
      setPendingNumHoles(newNumHoles);
      setShowHolesRangeModal(true);
    } else {
      await executeHolesChange(newNumHoles, null);
    }
  };

  const executeHolesChange = async (newNumHoles: 9 | 18, holesRange: '1-9' | '10-18' | null) => {
    if (!onHolesChanged) return;

    try {
      setChangingHoles(true);
      setError('');

      await golfService.updateRoundHoles(roundId, newNumHoles, holesRange);
      const holes = await golfService.getCourseHoles(courseId, newNumHoles, holesRange || undefined);

      onHolesChanged(newNumHoles, holes);
    } catch (err) {
      console.error('Error changing holes:', err);
      setError('Error cambiando número de hoyos');
    } finally {
      setChangingHoles(false);
    }
  };

  const handleHolesRangeConfirm = async (range: '1-9' | '10-18') => {
    if (pendingNumHoles !== null) {
      await executeHolesChange(pendingNumHoles, range);
      setPendingNumHoles(null);
    }
    setShowHolesRangeModal(false);
  };

  const handleHolesRangeCancel = () => {
    setPendingNumHoles(null);
    setShowHolesRangeModal(false);
  };

  const handleOpenHoleConfigClick = () => {
    setShowAdminPinModal(true);
    setPinError('');
  };

  const handlePinSubmit = (pin: string) => {
    if (adminPinUtils.verifyPin(pin)) {
      setShowAdminPinModal(false);
      setPinError('');
      onOpenHoleConfig();
    } else {
      setPinError('PIN incorrecto. Intenta de nuevo.');
    }
  };

  const handlePinCancel = () => {
    setShowAdminPinModal(false);
    setPinError('');
  };

  const handleEditPlayerClick = (player: Player, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingPlayer(player);
    setShowEditPlayerModal(true);
  };

  const handleEditPlayerConfirm = async (newName: string) => {
    if (!editingPlayer) return;

    try {
      await golfService.updatePlayerName(editingPlayer.id, newName);
      await loadPlayers();
      setShowEditPlayerModal(false);
      setEditingPlayer(null);
    } catch (err) {
      console.error('Error updating player name:', err);
      setError('Error actualizando el nombre del jugador');
    }
  };

  const handleEditPlayerCancel = () => {
    setShowEditPlayerModal(false);
    setEditingPlayer(null);
  };

  const canStartRound = players.length > 0;
  const maxPlayers = gameMode === 'match' ? 2 : gameMode === 'sindicato' ? 3 : gameMode === 'parejas' ? 4 : 4;
  const canAddMorePlayers = players.length < maxPlayers;
  const gameModeLabel = gameMode === 'match' ? 'Match' : gameMode === 'sindicato' ? 'Sindicato' : gameMode === 'parejas' ? 'Parejas' : 'Stableford';
  const requiredPlayers = gameMode === 'match' ? 2 : gameMode === 'sindicato' ? 3 : gameMode === 'parejas' ? 4 : 1;
  const canStartWithMode = players.length === requiredPlayers || gameMode === 'stableford';
  const nextPlayerNumber = Math.min(players.length + 1, maxPlayers);
  const playerNameLabel = gameMode === 'stableford'
    ? `Nombre del jugador ${nextPlayerNumber} de ${maxPlayers}`
    : gameMode === 'parejas'
      ? `Pareja ${nextPlayerNumber <= 2 ? 1 : 2} jugador ${nextPlayerNumber % 2 === 0 ? 2 : 1}`
      : `Jugador ${nextPlayerNumber}`;

  const isNewPlayer = searchTerm && !allPlayers.find(
    (p) => !p.auth_user_id && p.name.toLowerCase() === searchTerm.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-app p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-card rounded-lg shadow-card p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            {onBack && (
              <NavigationButton destination={backDestination}
                onClick={onBack}
                className="text-accent-ink hover:text-title font-semibold flex items-center gap-2 transition-colors"
              />
            )}
            <div className="flex-1"></div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-title mb-2 text-center">
            Configuración de Partida
          </h1>
          <p className="text-ink-3 text-center mb-2">Añade jugadores y configura la partida</p>
          {gameMode !== 'stableford' && (
            <div className="mb-4 bg-accent-soft border border-accent-ring rounded-lg px-4 py-2 text-center">
              <span className="text-sm font-semibold text-accent-ink">
                Modalidad: {gameModeLabel} — {requiredPlayers} jugadores
              </span>
            </div>
          )}

          {!canAddMorePlayers && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded mb-6">
              <p className="text-amber-800 font-semibold">
                {gameMode === 'match'
                  ? 'Match requiere exactamente 2 jugadores'
                  : gameMode === 'sindicato'
                  ? 'Sindicato requiere exactamente 3 jugadores'
                  : gameMode === 'parejas'
                  ? 'Parejas requiere exactamente 4 jugadores (2 parejas)'
                  : 'Límite alcanzado: Máximo 4 jugadores por partida'}
              </p>
            </div>
          )}

          {gameMode !== 'stableford' && players.length > 0 && players.length < requiredPlayers && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded mb-4">
              <p className="text-blue-800 text-sm font-medium">
                Faltan {requiredPlayers - players.length} jugador{requiredPlayers - players.length !== 1 ? 'es' : ''} para completar la modalidad {gameModeLabel}
              </p>
            </div>
          )}

          <WriteForm onSubmit={handleAddPlayer} className="space-y-4 mb-8">
            <div className="relative player-search-container">
              <label className="block text-sm font-semibold text-ink-2 mb-2">
                {playerNameLabel}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar o crear jugador..."
                  disabled={adding || loading || !canAddMorePlayers}
                  className="w-full px-4 py-3 pr-10 border-2 border-line-2 rounded-lg focus:outline-none focus:border-accent transition-colors disabled:bg-gray-100"
                  autoComplete="off"
                />
                <ChevronDown
                  size={20}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-ink-4 pointer-events-none"
                />
              </div>

              {showDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-card border-2 border-line-2 rounded-lg shadow-card max-h-60 overflow-y-auto">
                  {filteredPlayers.length > 0 ? (
                    <div>
                      <div className="px-3 py-2 text-xs font-semibold text-ink-3 bg-card-2 border-b">
                        JUGADORES EXISTENTES
                      </div>
                      {filteredPlayers.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center hover:bg-accent-soft border-b border-line transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectPlayer(player)}
                            disabled={player.handicap_pending}
                            className="flex-1 px-4 py-3 text-left"
                          >
                            <p className="font-semibold text-ink">{player.name}</p>
                            <p className="text-xs text-ink-3">{player.is_guest ? "Invitado" : player.auth_user_id ? "Miembro registrado" : "Miembro sin cuenta vinculada"}{player.handicap_pending && " · Hándicap pendiente"}</p>
                            <p className="text-sm text-ink-3">
                              Hándicap ({numHoles} hoyos): {player.handicap_pending ? "Pendiente" : numHoles === 18 ? (player.exact_handicap_18 ?? player.exact_handicap) * 2 : (player.exact_handicap_18 ?? player.exact_handicap)}
                            </p>
                          </button>
                          <WriteButton
                            type="button"
                            disabled={!!player.auth_user_id}
                            onClick={(e) => handleEditPlayerClick(player, e)}
                            className="px-3 py-3 text-ink-3 hover:text-emerald-600 transition-colors"
                            title="Editar nombre"
                          >
                            <Edit2 size={18} />
                          </WriteButton>
                        </div>
                      ))}
                    </div>
                  ) : searchTerm ? (
                    <div className="px-4 py-3 text-center text-ink-3">
                      No se encontraron jugadores
                    </div>
                  ) : null}

                  {isNewPlayer && searchTerm && !selectedPlayer && (
                    <button
                      type="button"
                      onClick={() => { setCreatingUnlinked(true); setSelectedPlayer(null); setShowDropdown(false); }}
                      className="w-full"
                    >
                      <div className="px-3 py-2 text-xs font-semibold text-ink-3 bg-card-2 border-b">
                        CREAR FICHA SIN CUENTA VINCULADA
                      </div>
                      <div className="px-4 py-3 bg-accent-soft hover:bg-accent-soft transition-colors">
                        <p className="font-semibold text-accent-ink">
                          Crear: {searchTerm}
                        </p>
                        <p className="text-sm text-ink-3">
                          Click para continuar
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {currentGroup && !selectedPlayer?.auth_user_id && (
              <div className="rounded-lg border border-line p-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-ink-2">
                  <input type="checkbox" checked={isGuest}
                    disabled={adding || loading || !canAddMorePlayers || !!selectedPlayer}
                    onChange={event => setIsGuest(event.target.checked)} />
                  Invitado: solo juega esta partida
                </label>
                <p className="text-xs text-ink-3 mt-2">
                  {isGuest || !selectedPlayer ? 'No contará en las estadísticas ni en los ajustes automáticos del grupo si marcas Invitado.' : 'Cuenta como miembro del grupo en estadísticas, cervezas y ajustes de hándicap.'}
                </p>
                {selectedPlayer?.is_guest && canManage && <div className="mt-2">
                  <WriteButton type="button" disabled={adding} onClick={() => setIsGuest(!isGuest)} className="text-sm text-accent-ink underline">
                    {isGuest ? 'Incorporar al grupo' : 'Mantener como invitado'}
                  </WriteButton>
                  {!isGuest && <p className="text-xs text-ink-3 mt-1">Se incorporará al añadirlo. Las partidas anteriores conservan su condición de invitado.</p>}
                </div>}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-ink-2 mb-2">
                Hándicap Exacto ({numHoles} hoyos)
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={numHoles === 18 ? 54 : 27}
                readOnly={!!selectedPlayer?.auth_user_id}
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                placeholder={numHoles === 9 ? "Ej: 7.0 (para 9 hoyos)" : "Ej: 14.0 (para 18 hoyos)"}
                disabled={adding || loading || !canAddMorePlayers}
                className="w-full px-4 py-3 border-2 border-line-2 rounded-lg focus:outline-none focus:border-accent transition-colors disabled:bg-gray-100"
              />
              {useSlope && (
                <div className="mt-2 p-3 bg-card-2 rounded-lg border border-line">
                  {!editingSlope ? (
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-ink-2">
                          Slope: {currentSlope}
                          {isManualSlope && <span className="text-amber-600 ml-1">(Manual)</span>}
                          {!isManualSlope && teeName && <span className="text-ink-3 ml-1">({teeName})</span>}
                        </p>
                        <p className="text-xs text-ink-3 mt-0.5">
                          El Hándicap de Juego será calculado automáticamente
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleEditSlope}
                          disabled={loading}
                          className="text-xs px-2 py-1 bg-accent hover:bg-accent-hover text-on-accent rounded transition-colors disabled:opacity-50"
                        >
                          Editar
                        </button>
                        {isManualSlope && (
                          <WriteButton
                            type="button"
                            onClick={handleResetSlope}
                            disabled={loading}
                            className="text-xs px-2 py-1 bg-ink-3 hover:bg-gray-700 text-white rounded transition-colors disabled:opacity-50"
                          >
                            Restablecer
                          </WriteButton>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={tempSlope}
                          onChange={(e) => setTempSlope(e.target.value)}
                          placeholder="Ej: 125"
                          min="55"
                          max="155"
                          className="flex-1 px-3 py-2 text-sm border-2 border-line-2 rounded-lg focus:outline-none focus:border-accent"
                        />
                        <WriteButton
                          type="button"
                          onClick={handleSaveSlope}
                          className="px-3 py-2 text-sm bg-accent hover:bg-accent-hover text-on-accent rounded-lg transition-colors"
                        >
                          Guardar
                        </WriteButton>
                        <button
                          type="button"
                          onClick={handleCancelEditSlope}
                          className="px-3 py-2 text-sm bg-ink-3 hover:bg-gray-700 text-white rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                      <p className="text-xs text-ink-3">
                        Rango válido: 55-155
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={adding || loading || !canAddMorePlayers}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-on-accent font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              {adding ? 'Añadiendo...' : isNewPlayer && !selectedPlayer ? 'Crear y Añadir Jugador' : 'Añadir Jugador'}
            </button>
          </WriteForm>

          <div className="border-t pt-6 mb-6">
            <h2 className="text-lg font-semibold text-ink mb-4">
              Jugadores Agregados ({players.length} de {maxPlayers})
            </h2>

            {players.length === 0 ? (
              <p className="text-ink-3 text-center py-4">
                Añade al menos un jugador para comenzar
              </p>
            ) : (
              <div className="space-y-3 mb-6">
                {gameMode === 'parejas' && players.length === 4 && (
                  <div className="flex items-center justify-center gap-4 mb-2 text-xs font-semibold">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500"></span>Pareja 1</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500"></span>Pareja 2</span>
                  </div>
                )}
                {players.map((player, idx) => {
                  const teamIdx = gameMode === 'parejas' && players.length === 4 ? (idx < 2 ? 0 : 1) : -1;
                  const teamColor = teamIdx === 0 ? 'border-l-4 border-l-blue-500 bg-blue-50' : teamIdx === 1 ? 'border-l-4 border-l-orange-500 bg-orange-50' : 'bg-card-2 border border-line';
                  return (
                  <div
                    key={player.id}
                    className={`${teamColor} rounded-lg p-4 flex items-center justify-between`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-ink">{player.name}</p>
                            <p className="text-xs text-ink-3">{player.is_guest ? "Invitado" : player.user_id ? "Cuenta registrada" : "Miembro sin cuenta vinculada"}</p>
                        {teamIdx >= 0 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${teamIdx === 0 ? 'bg-blue-200 text-blue-800' : 'bg-orange-200 text-orange-800'}`}>
                            P{teamIdx + 1}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-ink-3 space-y-0.5">
                        <p>Hándicap Exacto ({numHoles} hoyos): {numHoles === 18 ? (player.exact_handicap_18 ?? player.exact_handicap) * 2 : (player.exact_handicap_18 ?? player.exact_handicap)}</p>
                        <p className="font-medium text-accent-ink">
                          Hándicap de Juego: {player.playing_handicap}{useSlope ? ' (con Slope)' : ''}
                        </p>
                      </div>
                    </div>
                    <WriteButton
                      onClick={() => handleRemovePlayer(player.id)}
                      disabled={loading}
                      className="ml-3 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      aria-label="Eliminar jugador"
                    >
                      <Trash2 size={20} />
                    </WriteButton>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {accessCode && hasEditAccess && (
              <div className="bg-accent-soft border border-accent-ring rounded-lg p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Lock className="text-accent-ink shrink-0" size={20} />
                    <span className="text-sm font-medium text-title">Código de partida:</span>
                    <code className="text-lg font-bold text-accent-ink tracking-widest">
                      {showCode ? accessCode : '••••'}
                    </code>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCode(!showCode)}
                    className="text-accent-ink p-1 transition-colors shrink-0"
                    title={showCode ? 'Ocultar código' : 'Mostrar código'}
                    aria-label={showCode ? 'Ocultar código de partida' : 'Mostrar código de partida'}
                  >
                    {showCode ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-accent-ink mt-2">
                  Compártelo para que otros jugadores puedan unirse a la partida
                </p>
              </div>
            )}

            {currentGroup ? (
              <NavigationButton
                destination="home"
                aria-label="Guardar y volver al inicio"
                title="Guardar y volver al inicio"
                onClick={onStartRound}
                disabled={!canStartRound || loading || !canStartWithMode}
                className="bg-accent hover:bg-accent-hover text-on-accent py-3 px-3 disabled:bg-neutral-hover disabled:text-ink-3 disabled:cursor-not-allowed transition-colors"
              />
            ) : <WriteButton
              onClick={onStartRound}
              disabled={!canStartRound || loading || !canStartWithMode}
              className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
                canStartRound && !loading && canStartWithMode
                  ? 'bg-accent hover:bg-accent-hover text-on-accent cursor-pointer'
                  : 'bg-neutral-hover text-ink-3 cursor-not-allowed'
              }`
            }>
              Comenzar Partida
            </WriteButton>}
          </div>
        </div>
      </div>

      {showHolesRangeModal && (
        <HolesRangeModal
          onConfirm={handleHolesRangeConfirm}
          onCancel={handleHolesRangeCancel}
        />
      )}

      {showAdminPinModal && (
        <AdminPinModal
          onSubmit={handlePinSubmit}
          onCancel={handlePinCancel}
          error={pinError}
        />
      )}

      {showEditPlayerModal && editingPlayer && (
        <EditPlayerNameModal
          currentName={editingPlayer.name}
          onConfirm={handleEditPlayerConfirm}
          onCancel={handleEditPlayerCancel}
        />
      )}
    </div>
  );
};
