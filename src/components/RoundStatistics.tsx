import React, { useEffect, useState } from 'react';
import { Trophy, Target, Zap, Award, BarChart3, Calendar } from 'lucide-react';
import { SelectMenu } from './SelectMenu';
import { RoundPlayer, RoundScore, GolfHole } from '../types';
import { golfService } from '../services/golfService';

interface RoundStatisticsProps {
  players: RoundPlayer[];
  scores: RoundScore[];
  isCompleted: boolean;
  numHoles: number;
  roundId?: string;
}

interface PlayerStats {
  player: RoundPlayer;
  totalPoints: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  worse: number;
  bestHole: { hole: number; points: number } | null;
  worstHole: { hole: number; points: number } | null;
  holesPlayed: number;
}

export const RoundStatistics: React.FC<RoundStatisticsProps> = ({
  players,
  scores,
  isCompleted,
  numHoles,
  roundId,
}) => {
  const [holes, setHoles] = useState<GolfHole[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Nuevos estados para el desplegable
  const [availableRounds, setAvailableRounds] = useState<Array<{ id: string; created_at: string; status: string }>>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string>(roundId || '');

  // 1. Cargar la lista de partidas para llenar el desplegable
  useEffect(() => {
    const fetchAvailableRounds = async () => {
      try {
        const rounds = await golfService.getAvailableRoundsForStats();
        setAvailableRounds(rounds);
        if (rounds.length > 0 && !roundId) {
          setSelectedRoundId(rounds[0].id);
        }
      } catch (err) {
        console.error('Error al cargar la lista de partidas:', err);
      }
    };
    fetchAvailableRounds();
  }, [roundId]);

  // 2. Cargar los hoyos según la partida seleccionada en el desplegable
useEffect(() => {
  const currentId = selectedRoundId || roundId;
  if (!currentId) return;

  const loadRoundDetails = async () => {
    setLoading(true);
    try {
      // Carga la partida completa seleccionada en el desplegable
      const roundData = await golfService.getRoundWithDetails(currentId);
      if (roundData) {
        setHoles(roundData.holes);
        // Si el componente almacena players y scores en estado interno, actualízalos aquí
      }
    } catch (err) {
      console.error('Error al cargar la partida:', err);
    } finally {
      setLoading(false);
    }
  };

  loadRoundDetails();
}, [selectedRoundId, roundId]);

  if (!isCompleted) {
    return (
      <div className="bg-card rounded-lg shadow-card p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-card-2 rounded-full mb-4">
          <BarChart3 className="w-8 h-8 text-ink-4" />
        </div>
        <h3 className="text-xl font-bold text-ink mb-2">Estadísticas de la partida</h3>
        <p className="text-ink-3">
          Las estadísticas estarán disponibles cuando finalices la partida
        </p>
      </div>
    );
  }

  if (loading || holes.length === 0) {
    return (
      <div className="bg-card rounded-lg shadow-card p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
        <p className="text-ink-3">Cargando estadísticas...</p>
      </div>
    );
  }

  const calculatePlayerStats = (player: RoundPlayer): PlayerStats => {
    const playerScores = scores.filter((s) => s.player_id === player.id);
    const totalPoints = playerScores.reduce((sum, s) => sum + s.stableford_points, 0);

    let eagles = 0;
    let birdies = 0;
    let pars = 0;
    let bogeys = 0;
    let doubleBogeys = 0;
    let worse = 0;
    let bestHole: { hole: number; points: number } | null = null;
    let worstHole: { hole: number; points: number } | null = null;

    playerScores.forEach((score) => {
      const hole = holes.find((h) => h.hole_number === score.hole_number);
      if (!hole) return;

      const diff = score.gross_strokes - hole.par;

      if (diff <= -2) eagles++;
      else if (diff === -1) birdies++;
      else if (diff === 0) pars++;
      else if (diff === 1) bogeys++;
      else if (diff === 2) doubleBogeys++;
      else if (diff > 2) worse++;

      if (!bestHole || score.stableford_points > bestHole.points) {
        bestHole = { hole: score.hole_number, points: score.stableford_points };
      }

      if (!worstHole || score.stableford_points < worstHole.points) {
        worstHole = { hole: score.hole_number, points: score.stableford_points };
      }
    });

    return {
      player,
      totalPoints,
      eagles,
      birdies,
      pars,
      bogeys,
      doubleBogeys,
      worse,
      bestHole,
      worstHole,
      holesPlayed: playerScores.length,
    };
  };

  const allPlayerStats = players.map(calculatePlayerStats).sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.player.playing_handicap - b.player.playing_handicap;
  });

  const winner = allPlayerStats[0];
  const mostBirdies = allPlayerStats.reduce((max, p) => (p.birdies > max.birdies ? p : max));
  const mostPars = allPlayerStats.reduce((max, p) => (p.pars > max.pars ? p : max));
  const bestSingleHole = allPlayerStats.reduce((best, p) => {
    if (!p.bestHole) return best;
    if (!best.bestHole) return p;
    return p.bestHole.points > best.bestHole.points ? p : best;
  });
//FBP.Ini
      // Obtenemos todas las partidas del usuario (completed + archived)
      // Por defecto seleccionamos la más reciente si no hay una preseleccionada
//FBP.Fin
  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg shadow-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-yellow-100 p-3 rounded-full">
            <Trophy className="w-6 h-6 text-yellow-800" />
          </div>
          <h3 className="text-2xl font-bold text-ink">Estadísticas de la partida</h3>
        </div>
<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-line">
  <div className="flex items-center gap-3">
    <div className="bg-yellow-100 p-3 rounded-full">
      <Trophy className="w-6 h-6 text-yellow-800" />
    </div>
    <h3 className="text-2xl font-bold text-ink">Estadísticas de la partida</h3>
  </div>

  {/* Desplegable para cambiar de partida */}
  {availableRounds.length > 0 && (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-ink-3 whitespace-nowrap">
        Partida:
      </label>
      <SelectMenu
        value={selectedRoundId}
        onChange={setSelectedRoundId}
        ariaLabel="Partida a mostrar"
        icon={<Calendar size={19} />}
        className="md:w-72"
        options={availableRounds.map((r) => ({
          value: r.id,
          label: `${new Date(r.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${r.status === 'completed' ? '(Última)' : '(Archivada)'}`,
        }))}
      />
    </div>
  )}
</div>
        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl p-6 border-2 border-yellow-400 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-800 font-semibold mb-1">GANADOR</p>
              <p className="text-3xl font-bold text-yellow-900">{winner.player.name}{winner.player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
              <p className="text-sm text-yellow-700 mt-1">
                HCP {winner.player.playing_handicap} • {winner.holesPlayed} hoyos
              </p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold text-yellow-800">{winner.totalPoints}</p>
              <p className="text-sm text-yellow-700">puntos</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {mostBirdies.birdies > 0 && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-blue-600" />
                <p className="text-sm font-semibold text-blue-900">Rey del Birdie</p>
              </div>
              <p className="text-2xl font-bold text-blue-700">{mostBirdies.player.name}{mostBirdies.player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
              <p className="text-sm text-blue-600">{mostBirdies.birdies} {mostBirdies.birdies === 1 ? 'birdie' : 'birdies'}</p>
            </div>
          )}

          {mostPars.pars > 0 && (
            <div className="bg-accent-soft rounded-lg p-4 border border-accent-ring">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5 text-accent-ink" />
                <p className="text-sm font-semibold text-title">Más Consistente</p>
              </div>
              <p className="text-2xl font-bold text-accent-ink">{mostPars.player.name}{mostPars.player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
              <p className="text-sm text-accent-ink">{mostPars.pars} {mostPars.pars === 1 ? 'par' : 'pares'}</p>
            </div>
          )}

          {bestSingleHole.bestHole && (
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-purple-600" />
                <p className="text-sm font-semibold text-purple-900">Mejor Hoyo</p>
              </div>
              <p className="text-2xl font-bold text-purple-700">{bestSingleHole.player.name}{bestSingleHole.player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
              <p className="text-sm text-purple-600">
                Hoyo {bestSingleHole.bestHole.hole} ({bestSingleHole.bestHole.points} pts)
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h4 className="font-bold text-ink text-lg mb-3">Clasificación Final</h4>
          {allPlayerStats.map((stats, index) => (
            <div
              key={stats.player.id}
              className={`p-4 rounded-lg ${
                index === 0
                  ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-400'
                  : index === 1
                  ? 'bg-card-2 border-2 border-line-2'
                  : index === 2
                  ? 'bg-gradient-to-r from-orange-100 to-orange-50 border-2 border-orange-400'
                  : 'bg-card-2 border border-line'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full ${
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
                    <p className="font-bold text-lg text-ink">{stats.player.name}{stats.player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
                    <p className="text-sm text-ink-3">
                      HCP {stats.player.playing_handicap} • {stats.holesPlayed} hoyos
                    </p>
                  </div>
                </div>
                <p
                  className={`text-3xl font-bold ${
                    index === 0
                      ? 'text-yellow-800'
                      : index === 1
                      ? 'text-ink-3'
                      : index === 2
                      ? 'text-orange-600'
                      : 'text-accent-ink'
                  }`}
                >
                  {stats.totalPoints}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                {stats.eagles > 0 && (
                  <div className="bg-card rounded p-2">
                    <p className="text-xs text-ink-3 mb-1">Eagles</p>
                    <p className="font-bold text-lg text-purple-600">{stats.eagles}</p>
                  </div>
                )}
                {stats.birdies > 0 && (
                  <div className="bg-card rounded p-2">
                    <p className="text-xs text-ink-3 mb-1">Birdies</p>
                    <p className="font-bold text-lg text-blue-600">{stats.birdies}</p>
                  </div>
                )}
                {stats.pars > 0 && (
                  <div className="bg-card rounded p-2">
                    <p className="text-xs text-ink-3 mb-1">Pares</p>
                    <p className="font-bold text-lg text-accent-ink">{stats.pars}</p>
                  </div>
                )}
                {stats.bogeys > 0 && (
                  <div className="bg-card rounded p-2">
                    <p className="text-xs text-ink-3 mb-1">Bogeys</p>
                    <p className="font-bold text-lg text-orange-600">{stats.bogeys}</p>
                  </div>
                )}
                {stats.doubleBogeys > 0 && (
                  <div className="bg-card rounded p-2">
                    <p className="text-xs text-ink-3 mb-1">Dobles</p>
                    <p className="font-bold text-lg text-red-600">{stats.doubleBogeys}</p>
                  </div>
                )}
                {stats.worse > 0 && (
                  <div className="bg-card rounded p-2">
                    <p className="text-xs text-ink-3 mb-1">+3 o más</p>
                    <p className="font-bold text-lg text-red-800">{stats.worse}</p>
                  </div>
                )}
              </div>

              {stats.bestHole && stats.worstHole && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-accent-soft rounded p-2 text-center">
                    <p className="text-xs text-accent-ink mb-1">Mejor hoyo</p>
                    <p className="font-bold text-green-800">
                      Hoyo {stats.bestHole.hole} ({stats.bestHole.points} pts)
                    </p>
                  </div>
                  <div className="bg-red-100 rounded p-2 text-center">
                    <p className="text-xs text-red-700 mb-1">Peor hoyo</p>
                    <p className="font-bold text-red-800">
                      Hoyo {stats.worstHole.hole} ({stats.worstHole.points} pts)
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
