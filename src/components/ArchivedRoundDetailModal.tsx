import { NavigationButton } from './NavigationButton';
import React, { useState, useEffect } from 'react';
import { X, Award, Target, Users, Trophy, Beer } from 'lucide-react';
import { golfService } from '../services/golfService';

interface ArchivedRoundDetailModalProps {
  round: any;
  onClose: () => void;
  onBack: () => void;
}

export const ArchivedRoundDetailModal: React.FC<ArchivedRoundDetailModalProps> = ({
  round,
  onClose,
  onBack,
}) => {
  const [dailyRanking, setDailyRanking] = useState<any[]>([]);
  const [allRounds, setAllRounds] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const modeLabels: Record<string, string> = {
    stableford: 'Stableford',
    match: 'Match Play',
    sindicato: 'Sindicato',
    parejas: 'Parejas',
  };
  const gameMode = round.game_mode || round.final_ranking?.[0]?.game_mode || 'stableford';
  const date = new Date(round.played_at).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  useEffect(() => {
    const loadDayData = async () => {
      try {
        setLoadingData(true);
        const [ranking, rounds] = await Promise.all([
          golfService.getDailyRankingForDate(round.group_id, new Date(round.played_at)),
          golfService.getArchivedRoundsForDate(round.group_id, new Date(round.played_at)),
        ]);
        setDailyRanking(ranking);
        setAllRounds(rounds);
      } catch (error) {
        console.error('Error loading day data:', error);
        setDailyRanking([]);
        setAllRounds([]);
      } finally {
        setLoadingData(false);
      }
    };

    loadDayData();
  }, [round.group_id, round.played_at]);

  const matchesPlayer = (entry: any, player: any) => player.player_id && entry.player_id ? entry.player_id === player.player_id : entry.player_name === player.player_name;

  const getRoundScorecard = (roundData: any) => {
    const holeScores = roundData.hole_scores || [];

    const uniqueHoles = Array.from(
      new Set(holeScores.map((score: any) => score.hole_number))
    ).sort((a: any, b: any) => a - b);

    const holesArray = uniqueHoles.map((holeNum) => {
      const firstScore = holeScores.find((s: any) => s.hole_number === holeNum);
      return {
        hole_number: holeNum,
        par: firstScore?.par || 0,
      };
    });

    const getScoreForHole = (player: any, holeNumber: number) => {
      const score = holeScores.find((s: any) => matchesPlayer(s, player) && s.hole_number === holeNumber);
      if (!score) return { gross: '-', net: '-', points: '-', noPasoRojas: false };
      return {
        gross: score.gross_strokes || '-',
        net: score.net_strokes || '-',
        points: score.stableford_points || 0,
        noPasoRojas: score.no_paso_rojas || false,
      };
    };

    const getPlayerTotals = (player: any) => {
      const playerScores = holeScores.filter((s: any) => matchesPlayer(s, player));
      const playerStat = roundData.player_stats?.find((ps: any) => matchesPlayer(ps, player));

      if (!playerScores || playerScores.length === 0) {
        return { totalGross: 0, totalNet: 0, totalPoints: 0, noPasoRojasCount: 0 };
      }
      return {
        totalGross: playerScores.reduce((sum: number, s: any) => sum + (s.gross_strokes || 0), 0),
        totalNet: playerScores.reduce((sum: number, s: any) => sum + (s.net_strokes || 0), 0),
        totalPoints: playerScores.reduce((sum: number, s: any) => sum + (s.stableford_points || 0), 0),
        noPasoRojasCount: playerStat?.no_paso_rojas_count || 0,
      };
    };

    return { holesArray, getScoreForHole, getPlayerTotals, holeScores };
  };

  const getRoundStats = (roundData: any) => {
    const getPlayerStats = (player: any) => {
      const playerStat = roundData.player_stats?.find((ps: any) => matchesPlayer(ps, player));
      const playerScores = roundData.hole_scores?.filter((s: any) => matchesPlayer(s, player)) || [];

      const eagles = playerStat?.hole_results?.eagles || playerScores.filter((s: any) => s.net_strokes <= s.par - 2).length;
      const birdies = playerStat?.hole_results?.birdies || playerScores.filter((s: any) => s.net_strokes === s.par - 1).length;
      const bogeys = playerStat?.hole_results?.bogeys || playerScores.filter((s: any) => s.net_strokes === s.par + 1).length;

      // Dobles+ debe incluir dobles bogeys + triples bogeys+
      let double_bogeys;
      if (playerStat?.hole_results?.double_bogeys !== undefined) {
        double_bogeys = (playerStat.hole_results.double_bogeys || 0) + (playerStat.hole_results.triple_bogey_plus || 0);
      } else {
        double_bogeys = playerScores.filter((s: any) => s.net_strokes >= s.par + 2).length;
      }

      let pars = playerStat?.hole_results?.pars;
      if (pars === undefined || pars === null) {
        pars = playerScores.filter((s: any) => s.net_strokes === s.par).length;
      }

      return {
        eagles,
        birdies,
        pars,
        bogeys,
        double_bogeys,
        no_paso_rojas_count: playerStat?.no_paso_rojas_count || 0,
      };
    };

    return getPlayerStats;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg shadow-card max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-emerald-600 to-emerald-700">
          <div className="flex items-center gap-3">
            <NavigationButton destination="back"
              onClick={onBack}
              className="text-white hover:bg-accent-hover p-2 rounded-lg transition-colors"
            />
            <div>
              <h2 className="text-2xl font-bold text-white">Detalles del Día</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-on-deep text-sm">{date}</p>
                <span className="bg-on-accent/20 text-white text-xs font-bold px-2 py-1 rounded-md">
                  {modeLabels[gameMode] || modeLabels.stableford}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-accent-hover p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          <div className="space-y-8">
            {round.decided_result && (
              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Resultado oficial</p>
                <p className="mt-1 text-xl font-black text-emerald-950">{round.decided_result.winner_label}</p>
                <p className="mt-2 text-3xl font-black text-emerald-700">{round.decided_result.display_text}</p>
              </div>
            )}
            {!loadingData && dailyRanking.length > 0 && (
              <div>
                <h3 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
                  <Users className="text-blue-500" />
                  Clasificación General del día
                </h3>
                <div className="space-y-2">
                  {dailyRanking.map((player: any, index: number) => {
                    const totalPlayers = dailyRanking.length;
                    const isOdd = totalPlayers % 2 !== 0;
                    const middleIndex = Math.floor(totalPlayers / 2);

                    let bgColor = 'bg-amber-50';
                    let borderColor = 'border-amber-200';

                    if (isOdd && index === middleIndex) {
                      bgColor = 'bg-amber-50';
                      borderColor = 'border-amber-200';
                    } else if (index < middleIndex) {
                      bgColor = 'bg-blue-50';
                      borderColor = 'border-blue-200';
                    } else {
                      bgColor = 'bg-red-50';
                      borderColor = 'border-red-200';
                    }

                    return (
                      <div
                        key={player.game_player_id || player.player_name}
                        className={`p-3 rounded-lg border ${bgColor} ${borderColor}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="text-lg font-bold w-8 text-ink-2">
                              {player.position}°
                            </div>
                            <div>
                              <p className="font-semibold text-ink">{player.player_name}{player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}</p>
                              <p className="text-xs text-ink-3">(HCP juego: {player.hcp_juego})</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {player.no_paso_rojas_count > 0 && (
                              <div className="flex items-center gap-1">
                                {Array.from({ length: player.no_paso_rojas_count }).map((_, i) => (
                                  <div
                                    key={i}
                                    className="w-5 h-5 rounded-full bg-red-500 border-2 border-red-700"
                                  ></div>
                                ))}
                              </div>
                            )}
                            <p className="text-2xl font-bold text-ink">{player.total_points} pts</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <Beer className="text-blue-500" size={18} />
                    <span className="text-ink-2">Azul: Recibe cerveza</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-amber-300 rounded"></div>
                    <span className="text-ink-2">Amarillo: Ni recibe ni paga</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Beer className="text-red-500" size={18} />
                    <span className="text-ink-2">Rojo: Paga cerveza</span>
                  </div>
                </div>
              </div>
            )}

            {!loadingData && allRounds.map((roundData, roundIndex) => {
              const { holesArray, getScoreForHole, getPlayerTotals } = getRoundScorecard(roundData);

              return (
                <div key={roundData.id}>
                  <h3 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
                    <Target className="text-accent-ink" />
                    Tarjeta Completa - {roundData.course_name} {allRounds.length > 1 && `(Partida ${roundIndex + 1})`}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border border-line rounded-lg">
                      <thead className="bg-card-2">
                        <tr>
                          <th className="text-left py-2 px-2 font-semibold text-ink-2 border-b sticky left-0 bg-card-2 z-10">Hoyo</th>
                          <th className="text-center py-2 px-2 font-semibold text-ink-2 border-b">Par</th>
                          {roundData.final_ranking?.map((player: any, index: number) => (
                            <th
                              key={index}
                              colSpan={3}
                              className={`text-center py-2 px-2 font-semibold border-b border-l ${index === 0 ? 'bg-amber-200 text-ink' : 'text-ink-2'}`}
                            >
                              <div className="flex items-center justify-center gap-1">
                                {index === 0 && <Trophy size={16} className="text-amber-600" />}
                                {gameMode === 'parejas' && roundData.final_ranking.length === 4 && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${index < 2 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                                    {index < 2 ? 'P1' : 'P2'}
                                  </span>
                                )}
                                {player.player_name}{player.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}
                              </div>
                            </th>
                          ))}
                        </tr>
                        <tr className="bg-card-2">
                          <th className="py-1 px-2 border-b sticky left-0 bg-card-2 z-10"></th>
                          <th className="py-1 px-2 border-b"></th>
                          {roundData.final_ranking?.map((_: any, index: number) => (
                            <React.Fragment key={index}>
                              <th className={`text-center py-1 px-1 text-ink-3 border-b border-l text-[10px] ${index === 0 ? 'bg-amber-200' : ''}`}>B</th>
                              <th className={`text-center py-1 px-1 text-ink-3 border-b text-[10px] ${index === 0 ? 'bg-amber-200' : ''}`}>N</th>
                              <th className={`text-center py-1 px-1 text-ink-3 border-b text-[10px] ${index === 0 ? 'bg-amber-200' : ''}`}>P</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {holesArray.map((hole: any) => (
                          <tr key={hole.hole_number} className="hover:bg-card-2 border-b">
                            <td className="py-2 px-2 font-bold text-ink sticky left-0 bg-card z-10">{hole.hole_number}</td>
                            <td className="text-center py-2 px-2 font-semibold text-ink-2">{hole.par}</td>
                            {roundData.final_ranking?.map((player: any, index: number) => {
                              const score = getScoreForHole(player, hole.hole_number);
                              const isWinner = index === 0;
                              const cellBg = score.noPasoRojas ? 'bg-red-200' : (isWinner ? 'bg-amber-100' : '');
                              return (
                                <React.Fragment key={index}>
                                  <td className={`text-center py-2 px-1 border-l ${cellBg}`}>
                                    {score.gross}
                                  </td>
                                  <td className={`text-center py-2 px-1 ${cellBg}`}>
                                    {score.net}
                                  </td>
                                  <td className={`text-center py-2 px-1 font-bold ${score.noPasoRojas ? 'bg-red-200 text-red-700' : (isWinner ? 'bg-amber-100 text-accent-ink' : 'text-accent-ink')}`}>
                                    {score.points}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))}
                        <tr className="bg-card-2 font-bold">
                          <td className="py-2 px-2 sticky left-0 bg-card-2 z-10">TOTAL</td>
                          <td className="text-center py-2 px-2">{holesArray.reduce((sum: number, h: any) => sum + h.par, 0)}</td>
                          {roundData.final_ranking?.map((player: any, index: number) => {
                            const totals = getPlayerTotals(player);
                            const isWinner = index === 0;
                            return (
                              <React.Fragment key={index}>
                                <td className={`text-center py-2 px-1 border-l ${isWinner ? 'bg-amber-200' : ''}`}>{totals.totalGross || '-'}</td>
                                <td className={`text-center py-2 px-1 ${isWinner ? 'bg-amber-200' : ''}`}>{totals.totalNet || '-'}</td>
                                <td className={`text-center py-2 px-1 ${isWinner ? 'bg-amber-200 text-accent-ink' : 'text-accent-ink'}`}>{totals.totalPoints}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-xs text-ink-3">
                    <p><strong>B</strong> = Bruto | <strong>N</strong> = Neto | <strong>P</strong> = Puntos</p>
                    <p className="mt-1">Las celdas con fondo rojo indican "No pasó de rojas"</p>
                  </div>
                </div>
              );
            })}

            {!loadingData && allRounds.map((roundData, roundIndex) => {
              const getPlayerStats = getRoundStats(roundData);

              return roundData.player_stats && roundData.player_stats.length > 0 && (
                <div key={`stats-${roundData.id}`}>
                  <h3 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
                    <Award className="text-blue-500" />
                    Estadísticas - {roundData.course_name} {allRounds.length > 1 && `(Partida ${roundIndex + 1})`}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-line rounded-lg">
                      <thead className="bg-card-2">
                        <tr>
                          <th className="text-left py-3 px-4 font-semibold text-ink-2 border-b">Jugador</th>
                          <th className="text-center py-3 px-4 font-semibold text-ink-2 border-b">Eagles</th>
                          <th className="text-center py-3 px-4 font-semibold text-ink-2 border-b">Birdies</th>
                          <th className="text-center py-3 px-4 font-semibold text-ink-2 border-b">Pares</th>
                          <th className="text-center py-3 px-4 font-semibold text-ink-2 border-b">Bogeys</th>
                          <th className="text-center py-3 px-4 font-semibold text-ink-2 border-b">Dobles+</th>
                          <th className="text-center py-3 px-4 font-semibold text-ink-2 border-b">No Rojas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roundData.player_stats.map((playerStat: any, index: number) => {
                          const stats = getPlayerStats(playerStat);
                          const isWinner = matchesPlayer(roundData.final_ranking?.[0] || {}, playerStat);
                          return (
                            <tr key={index} className={`border-b hover:bg-card-2 ${isWinner ? 'bg-amber-100' : ''}`}>
                              <td className="py-3 px-4 font-semibold text-ink">
                                <div className="flex items-center gap-2">
                                  {isWinner && <Trophy size={18} className="text-amber-600" />}
                                  {playerStat.player_name}{playerStat.is_guest && <span className="ml-1 text-xs font-normal">(Invitado)</span>}
                                  {isWinner && <span className="text-xs text-amber-600 font-bold">(Ganador/a)</span>}
                                </div>
                              </td>
                              <td className="text-center py-3 px-4 text-ink-2">{stats.eagles}</td>
                              <td className="text-center py-3 px-4 text-ink-2">{stats.birdies}</td>
                              <td className="text-center py-3 px-4 text-ink-2">{stats.pars}</td>
                              <td className="text-center py-3 px-4 text-ink-2">{stats.bogeys}</td>
                              <td className="text-center py-3 px-4 text-ink-2">{stats.double_bogeys}</td>
                              <td className="text-center py-3 px-4">
                                {stats.no_paso_rojas_count > 0 ? (
                                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                                    {stats.no_paso_rojas_count}
                                  </span>
                                ) : (
                                  <span className="text-ink-4">0</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t bg-card-2 flex gap-3">

          <button
            onClick={onClose}
            className="flex-1 bg-accent hover:bg-accent-hover text-on-accent font-semibold py-3 rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
