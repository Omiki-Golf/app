import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import { OmikiLoadingScreen } from './OmikiSpinner';
import React, { useState, useEffect, useCallback } from 'react';
import { SelectMenu } from './SelectMenu';
import { golfService } from '../services/golfService';
import { User, Users, MapPin, TrendingUp, Trophy, Award, Beer, ChevronRight, Euro, Zap, ThumbsDown, Calendar, Target, Activity, TreePine } from 'lucide-react';
import {
  Group,
  ArchivedRound,
  PlayerStatisticsSummary,
  DetailedPlayerStatistics,
  GroupStatisticsSummary,
  CourseStatisticsSummary,
  HolePerformanceStatistics,
  BestCourseRoundStatistics,
  RankingRpcRow,
} from '../types';
import { AwardRankingModal } from './AwardRankingModal';
import { ArchivedRoundsModal } from './ArchivedRoundsModal';
import { ArchivedRoundDetailModal } from './ArchivedRoundDetailModal';

interface StatisticsProps {
  onBack: () => void;
  backDestination?: 'back' | 'home';
  currentGroup: Group;
  messagesButton?: React.ReactNode;
}

type TabType = 'player' | 'group' | 'course';

interface PlayerStatisticsView extends PlayerStatisticsSummary {
  detailed: DetailedPlayerStatistics | null;
}

interface CourseStatisticsView extends CourseStatisticsSummary {
  hoyoMuerte: HolePerformanceStatistics | null;
  hoyoGloria: HolePerformanceStatistics | null;
  mejorRonda: BestCourseRoundStatistics | null;
}

interface Phase2Statistics {
  killer: RankingRpcRow | null;
  paquete: RankingRpcRow | null;
  shark: RankingRpcRow | null;
  viciado: RankingRpcRow | null;
  francotirador: RankingRpcRow | null;
  maquina: RankingRpcRow | null;
  amigoDelMasUno: RankingRpcRow | null;
  reyDelBosque: RankingRpcRow | null;
  laPaliza: RankingRpcRow | null;
  sharkRanking: RankingRpcRow[];
  viciadoRanking: RankingRpcRow[];
  francotiradorRanking: RankingRpcRow[];
  maquinaRanking: RankingRpcRow[];
  amigoDelMasUnoRanking: RankingRpcRow[];
  reyDelBosqueRanking: RankingRpcRow[];
}

interface ModalRankingEntry extends RankingRpcRow {
  value?: number;
  rounds_played?: number;
  handicap: number | null;
}

const toModalRanking = (
  entries: RankingRpcRow[],
  getValue: (entry: RankingRpcRow) => number | undefined,
): ModalRankingEntry[] => entries.map((entry) => ({
  ...entry,
  value: getValue(entry),
  rounds_played: entry.total_rounds,
  handicap: entry.avg_handicap ?? entry.handicap ?? entry.player_handicap ?? null,
}));

export const Statistics: React.FC<StatisticsProps> = ({ onBack, backDestination = 'back', currentGroup, messagesButton }) => {
  const [activeTab, setActiveTab] = useState<TabType>('player');
  // Empieza cargando: así no se ve un instante la pantalla con pestañas antes de saber si hay partidas.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [archivedRounds, setArchivedRounds] = useState<ArchivedRound[]>([]);
  const [historyRounds, setHistoryRounds] = useState<ArchivedRound[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [playerStats, setPlayerStats] = useState<PlayerStatisticsView | null>(null);
  const [groupStats, setGroupStats] = useState<GroupStatisticsSummary | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [courseStats, setCourseStats] = useState<CourseStatisticsView | null>(null);
  const [divendStats, setDivendStats] = useState<Awaited<ReturnType<typeof golfService.getDivendStatistics>> | null>(null);

  const [uniquePlayers, setUniquePlayers] = useState<string[]>([]);
  const [uniqueCourses, setUniqueCourses] = useState<string[]>([]);

  // En Statistics.tsx, dentro de openRankingModal, al final antes del setRankingModal:
  //console.log('--- DATOS DEL RANKING ---', data);
  const [rankingModal, setRankingModal] = useState<{
    isOpen: boolean;
    type: 'patrocinador' | 'barraLibre' | 'corto' | 'driverOro' | 'shark' | 'viciado' | 'francotirador' | 'maquina' | 'amigoDelMasUno' | 'reyDelBosque' | null;
    data: ModalRankingEntry[];
  }>({
    isOpen: false,
    type: null,
    data: [],
  });

  const [phase2Stats, setPhase2Stats] = useState<Phase2Statistics | null>(null);
  const [showArchivedRoundsModal, setShowArchivedRoundsModal] = useState(false);
  const [selectedArchivedRound, setSelectedArchivedRound] = useState<ArchivedRound | null>(null);

  // Rojas y cervezas: grupos con la gamificación Hoyo 19 activada (DIVEND siempre).
  const isDivend = currentGroup.group_code === 'DIVEND' || !!currentGroup.hoyo_19_enabled;

  const loadPlayerStatistics = useCallback(async (playerName: string) => {
    try {
      const [basicStats, detailedStats] = await Promise.all([
        golfService.getPlayerStatistics(playerName, currentGroup.id),
        golfService.getDetailedPlayerStatistics(playerName, currentGroup.id),
      ]);

      setPlayerStats({
        ...basicStats,
        detailed: detailedStats,
      });
    } catch (err) {
      setError('Error cargando estadísticas del jugador');
      console.error(err);
    }
  }, [currentGroup.id]);

  const loadGroupStatistics = useCallback(async () => {
    try {
      const stats = await golfService.getGroupStatistics(currentGroup.id);
      setGroupStats(stats);

      if (isDivend) {
        const divend = await golfService.getDivendStatistics(currentGroup.id);
        setDivendStats(divend);
      }

      try {
        const [killer, paquete, shark, viciado, francotirador, maquina, amigoDelMasUno, reyDelBosque, laPaliza] = await Promise.all([
          golfService.getKillerRanking(currentGroup.id).catch(e => { console.error('Killer error:', e); return null; }),
          golfService.getPaqueteRanking(currentGroup.id).catch(e => { console.error('Paquete error:', e); return null; }),
          golfService.getSharkRanking(currentGroup.id).catch(e => { console.error('Shark error:', e); return []; }),
          golfService.getViciadoRanking(currentGroup.id).catch(e => { console.error('Viciado error:', e); return []; }),
          golfService.getFrancotiradorRanking(currentGroup.id).catch(e => { console.error('Francotirador error:', e); return []; }),
          golfService.getMaquinaRanking(currentGroup.id).catch(e => { console.error('Maquina error:', e); return []; }),
          golfService.getAmigoDelMasUnoRanking(currentGroup.id).catch(e => { console.error('Amigo error:', e); return []; }),
          golfService.getReyDelBosqueRanking(currentGroup.id).catch(e => { console.error('Rey error:', e); return []; }),
          golfService.getLaPaliza(currentGroup.id).catch(e => { console.error('Paliza error:', e); return null; }),
        ]);

        setPhase2Stats({
          killer,
          paquete,
          shark: shark?.[0] || null,
          viciado: viciado?.[0] || null,
          francotirador: francotirador?.[0] || null,
          maquina: maquina?.[0] || null,
          amigoDelMasUno: amigoDelMasUno?.[0] || null,
          reyDelBosque: reyDelBosque?.[0] || null,
          laPaliza,
          sharkRanking: shark,
          viciadoRanking: viciado,
          francotiradorRanking: francotirador,
          maquinaRanking: maquina,
          amigoDelMasUnoRanking: amigoDelMasUno,
          reyDelBosqueRanking: reyDelBosque,
        });
      } catch (phase2Err) {
        console.error('Error loading Phase 2 stats:', phase2Err);
      }
    } catch (err) {
      setError('Error cargando estadísticas del grupo');
      console.error(err);
    }
  }, [currentGroup.id, isDivend]);

  const loadCourseStatistics = useCallback(async (courseName: string) => {
    try {
      const [basicStats, hoyoMuerte, hoyoGloria, mejorRonda] = await Promise.all([
        golfService.getCourseStatistics(courseName, currentGroup.id),
        golfService.getHoyoMuerte(currentGroup.id, courseName).catch(() => null),
        golfService.getHoyoGloria(currentGroup.id, courseName).catch(() => null),
        golfService.getMejorRondaCampo(currentGroup.id, courseName).catch(() => null),
      ]);

      setCourseStats({
        ...basicStats,
        hoyoMuerte,
        hoyoGloria,
        mejorRonda,
      });
    } catch (err) {
      setError('Error cargando estadísticas del campo');
      console.error(err);
    }
  }, [currentGroup.id]);

  const loadArchivedRounds = useCallback(async () => {
    try {
      setLoading(true);
      const [rounds, history] = await Promise.all([
        golfService.getStatisticsRounds(currentGroup.id),
        golfService.getArchivedRounds(currentGroup.id),
      ]);
      setHistoryRounds(history);
      setArchivedRounds(rounds);

      const players = new Set<string>();
      const courses = new Set<string>();

      rounds.forEach((round) => {
        courses.add(round.course_name);
        round.final_ranking.forEach((ranking) => players.add(ranking.player_name));
      });

      setUniquePlayers(Array.from(players).sort());
      setUniqueCourses(Array.from(courses).sort());

      if (players.size > 0 && !selectedPlayer) {
        const firstPlayer = Array.from(players).sort()[0];
        setSelectedPlayer(firstPlayer);
        await loadPlayerStatistics(firstPlayer);
      }

      if (courses.size > 0 && !selectedCourse) {
        const firstCourse = Array.from(courses).sort()[0];
        setSelectedCourse(firstCourse);
        await loadCourseStatistics(firstCourse);
      }

      await loadGroupStatistics();
    } catch (err) {
      setError('Error cargando estadísticas');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentGroup.id, selectedPlayer, selectedCourse, loadPlayerStatistics, loadCourseStatistics, loadGroupStatistics]);

  useEffect(() => {
    void loadArchivedRounds();
  }, [loadArchivedRounds]);

  const handlePlayerChange = async (playerName: string) => {
    setSelectedPlayer(playerName);
    await loadPlayerStatistics(playerName);
  };

  const handleCourseChange = async (courseName: string) => {
    setSelectedCourse(courseName);
    await loadCourseStatistics(courseName);
  };

  const openRankingModal = async (type: 'patrocinador' | 'barraLibre' | 'corto' | 'driverOro' | 'shark' | 'viciado' | 'francotirador' | 'maquina' | 'amigoDelMasUno' | 'reyDelBosque') => {
    console.log('>>> 1. BOTÓN PULSADO - Tipo de ranking:', type);
    try {
      let modalData: ModalRankingEntry[] = [];

      switch (type) {
        case 'patrocinador': {
          console.log('>>> 2. Llamando a getPatrocinadorRanking...');
          const patrocinadorData = await golfService.getPatrocinadorRanking(currentGroup.id);
          console.log('>>> 3. DATOS RECIBIDOS DE LA API (Patrocinador):', patrocinadorData);

          modalData = toModalRanking(patrocinadorData, (entry) => entry.total_beers_paid);
          break;
        }
        case 'barraLibre': {
          const barraLibreData = await golfService.getBarraLibreRanking(currentGroup.id);
          console.log('>>> DATOS BARRA LIBRE:', barraLibreData);
          modalData = toModalRanking(barraLibreData, (entry) => entry.total_beers_won);
          break;
        }
        case 'corto': {
          const cortoData = await golfService.getCortoRanking(currentGroup.id);
          console.log('>>> DATOS CORTO:', cortoData);
          modalData = toModalRanking(cortoData, (entry) => entry.no_paso_rojas_count);
          break;
        }
        case 'driverOro': {
          const driverOroData = await golfService.getDriverOroRanking(currentGroup.id);
          console.log('>>> DATOS DRIVER ORO:', driverOroData);
          modalData = toModalRanking(driverOroData, (entry) => entry.no_paso_rojas_count);
          break;
        }
        case 'shark': {
          console.log('>>> DATOS SHARK:', phase2Stats?.sharkRanking);
          modalData = toModalRanking(phase2Stats?.sharkRanking || [], (entry) => entry.total_wins);
          break;
        }
        case 'viciado': {
          console.log('>>> DATOS VICIADO:', phase2Stats?.viciadoRanking);
          modalData = toModalRanking(phase2Stats?.viciadoRanking || [], (entry) => entry.total_rounds);
          break;
        }
        case 'francotirador': {
          console.log('>>> DATOS FRANCOTIRADOR:', phase2Stats?.francotiradorRanking);
          modalData = toModalRanking(phase2Stats?.francotiradorRanking || [], (entry) => entry.total_eagles);
          break;
        }
        case 'maquina': {
          console.log('>>> DATOS MAQUINA:', phase2Stats?.maquinaRanking);
          modalData = toModalRanking(phase2Stats?.maquinaRanking || [], (entry) => entry.total_birdies);
          break;
        }
        case 'amigoDelMasUno': {
          console.log('>>> DATOS AMIGO DEL +1:', phase2Stats?.amigoDelMasUnoRanking);
          modalData = toModalRanking(phase2Stats?.amigoDelMasUnoRanking || [], (entry) => entry.total_bogeys);
          break;
        }
        case 'reyDelBosque': {
          console.log('>>> DATOS REY DEL BOSQUE:', phase2Stats?.reyDelBosqueRanking);
          modalData = toModalRanking(phase2Stats?.reyDelBosqueRanking || [], (entry) => entry.total_double_bogeys_plus);
          break;
        }
      }

      console.log('>>> 4. DATOS MAPEADOS FINALES PARA EL MODAL:', modalData);
      setRankingModal({ isOpen: true, type, data: modalData });
    } catch (err) {
      console.error('>>> ERROR DENTRO DE openRankingModal:', err);
    }
  };

  const closeRankingModal = () => {
    setRankingModal({ isOpen: false, type: null, data: [] });
  };

  const renderHandicapEvolution = () => {
    const playerRounds = archivedRounds
      .filter((round) => round.final_ranking.some((r) => r.player_name === selectedPlayer))
      .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());

    if (playerRounds.length === 0) return null;

    const handicapData = playerRounds.map((round) => {
      const playerRanking = round.final_ranking.find((r) => r.player_name === selectedPlayer);
      return {
        date: new Date(round.played_at).toLocaleDateString('es-ES'),
        handicap: playerRanking?.handicap || 0,
        course: round.course_name,
      };
    });

    const initialHandicap = handicapData[0].handicap;
    const currentHandicap = handicapData[handicapData.length - 1].handicap;
    const change = currentHandicap - initialHandicap;

    return (
      <div className="bg-card rounded-lg p-6 border border-line">
        <h3 className="text-lg font-bold text-ink mb-4">Evolución de Handicap</h3>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-sm text-ink-3 mb-1 h-8 flex items-center justify-center">Primera partida</p>
            <p className="text-3xl font-bold text-blue-700">{initialHandicap.toFixed(1)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-sm text-ink-3 mb-1 h-8 flex items-center justify-center">Última partida</p>
            <p className="text-3xl font-bold text-blue-700">{currentHandicap.toFixed(1)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-sm text-ink-3 mb-1 h-8 flex items-center justify-center">Cambio</p>
            <p className={`text-3xl font-bold ${change < 0 ? 'text-accent-ink' : 'text-red-600'}`}>
              {change > 0 ? '+' : ''}{change.toFixed(1)}
            </p>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card-2 sticky top-0">
              <tr>
                <th className="sticky left-0 z-10 bg-card-2 text-left py-2 px-3 font-semibold text-ink-2">Fecha</th>
                <th className="text-left py-2 px-3 font-semibold text-ink-2">Campo</th>
                <th className="text-right py-2 px-3 font-semibold text-ink-2">Handicap</th>
                <th className="text-right py-2 px-3 font-semibold text-ink-2">Cambio</th>
              </tr>
            </thead>
            <tbody>
              {handicapData.map((entry, index) => {
                const prevHandicap = index > 0 ? handicapData[index - 1].handicap : entry.handicap;
                const diff = entry.handicap - prevHandicap;
                return (
                  <tr key={index} className="border-b border-line hover:bg-card-2">
                    <td className="sticky left-0 z-10 bg-card py-2 px-3 text-ink-3 border-r border-line">{entry.date}</td>
                    <td className="py-2 px-3 text-ink-3 truncate max-w-[150px]" title={entry.course}>
                      {entry.course}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-ink">
                      {entry.handicap.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {index > 0 && (
                        <span className={`font-semibold ${diff < 0 ? 'text-accent-ink' : diff > 0 ? 'text-red-600' : 'text-ink-4'}`}>
                          {diff !== 0 ? (diff > 0 ? '+' : '') + diff.toFixed(1) : '-'}
                        </span>
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
  };

  const renderAnalysisStats = () => {
    if (!playerStats?.detailed?.hole_results) return null;

    const { birdies, pars, bogeys, double_bogeys, triple_bogeys_plus } = playerStats.detailed.hole_results;
    const totalBogeyPlus = (bogeys || 0) + (double_bogeys || 0) + (triple_bogeys_plus || 0);
    const birdiesPerRound = (birdies || 0) / (playerStats.totalRounds || 1);
    const parsPerRound = (pars || 0) / (playerStats.totalRounds || 1);
    const bogeyPlusPerRound = totalBogeyPlus / (playerStats.totalRounds || 1);
    const ratio = (birdies || 0) / (totalBogeyPlus || 1);

    return (
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Análisis de Juego</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-5 border border-teal-200">
            <h4 className="text-sm font-semibold text-teal-900 mb-2">Ratio Birdies/Bogeys+</h4>
            <p className="text-4xl font-bold text-teal-700">{ratio.toFixed(2)}</p>
            <p className="text-xs text-ink-3 mt-2">
              {birdies || 0} birdies / {totalBogeyPlus} bogeys+
            </p>
          </div>

          <div className="bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg p-5 border border-sky-200">
            <h4 className="text-sm font-semibold text-sky-900 mb-2">Birdies por Partida</h4>
            <p className="text-4xl font-bold text-sky-700">{birdiesPerRound.toFixed(1)}</p>
            <p className="text-xs text-ink-3 mt-2">promedio</p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-5 border border-accent-ring">
            <h4 className="text-sm font-semibold text-title mb-2">Pares por Partida</h4>
            <p className="text-4xl font-bold text-accent-ink">{parsPerRound.toFixed(1)}</p>
            <p className="text-xs text-ink-3 mt-2">promedio</p>
          </div>

          <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-5 border border-rose-200">
            <h4 className="text-sm font-semibold text-rose-900 mb-2">Bogeys+ por Partida</h4>
            <p className="text-4xl font-bold text-rose-700">{bogeyPlusPerRound.toFixed(1)}</p>
            <p className="text-xs text-ink-3 mt-2">promedio</p>
          </div>
        </div>
      </div>
    );
  };

  const renderSpanishHandsStats = () => {
    const playerRounds = archivedRounds.filter((round) =>
      round.player_stats?.some((ps) => ps.player_name === selectedPlayer)
    );

    let totalSpanishHands = 0;
    let roundsWithSpanishHands = 0;
    playerRounds.forEach((round) => {
      const count = round.player_stats?.find((ps) => ps.player_name === selectedPlayer)?.spanish_hands_count || 0;
      totalSpanishHands += count;
      if (count > 0) roundsWithSpanishHands += 1;
    });

    if (playerRounds.length === 0) return null;

    return (
      <div className="bg-gradient-to-r from-sky-50 to-sky-100 rounded-lg p-6 border border-sky-200">
        <h3 className="text-xl font-bold text-sky-900 mb-4">Spanish Hands</h3>
        <div className="text-center">
          <p className="text-5xl font-bold text-sky-700">{totalSpanishHands}</p>
          <p className="text-sm text-ink-3 mt-2">
            en {roundsWithSpanishHands} de {playerRounds.length} partidas
          </p>
        </div>
      </div>
    );
  };

  const renderNoPasoRojasStats = () => {
    const playerRounds = archivedRounds.filter((round) =>
      round.player_stats?.some((ps) => ps.player_name === selectedPlayer)
    );

    if (playerRounds.length === 0) return null;

    let totalNoPasoRojas = 0;
    let totalHoles = 0;

    playerRounds.forEach((round) => {
      const playerStat = round.player_stats?.find((ps) => ps.player_name === selectedPlayer);
      if (playerStat) {
        totalNoPasoRojas += playerStat.no_paso_rojas_count || 0;
        totalHoles += playerStat.total_holes_played || 0;
      }
    });

    if (totalHoles === 0) return null;

    const percentage = (totalNoPasoRojas / totalHoles) * 100;

    return (
      <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-6 border border-orange-200">
        <h3 className="text-xl font-bold text-orange-900 mb-4">No pasó de Rojas</h3>
        <div className="text-center">
          <p className="text-5xl font-bold text-orange-700">{percentage.toFixed(1)}%</p>
          <p className="text-sm text-ink-3 mt-2">
            {totalNoPasoRojas} de {totalHoles} hoyos
          </p>
        </div>
      </div>
    );
  };

  if (loading && historyRounds.length === 0) return <OmikiLoadingScreen />;

  if (historyRounds.length === 0) {
    return (
      <div className="min-h-screen bg-app p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <TopBar left={<NavigationButton destination={backDestination} onClick={onBack} />} center={messagesButton} />

          <div className="bg-card rounded-lg shadow-card p-8 text-center">
            <TrendingUp size={64} className="mx-auto text-ink-4 mb-4" />
            <h2 className="text-2xl font-bold text-ink mb-2">No hay estadísticas disponibles</h2>
            <p className="text-ink-3">
              Archiva algunas partidas finalizadas para empezar a ver estadísticas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <TopBar className="mb-3" left={<NavigationButton destination={backDestination} onClick={onBack} />} center={messagesButton} />
        <h1 className="mb-6 text-center text-3xl font-bold text-title">Estadísticas</h1>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {!loading && archivedRounds.length === 0 && historyRounds.length > 0 && (
          <div className="bg-card rounded-lg p-4 mb-4 text-center">
            <p className="text-ink-3 mb-2">Las partidas con solo invitados se conservan en el historial y no generan estadísticas del grupo.</p>
            <button onClick={() => setShowArchivedRoundsModal(true)} className="text-accent-ink font-semibold">Ver historial de partidas</button>
          </div>
        )}

        <div className="bg-card rounded-lg shadow-card overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('player')}
              className={`flex-1 py-4 px-6 font-semibold flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'player'
                  ? 'bg-accent text-on-accent'
                  : 'bg-card-2 text-ink-2 hover:bg-gray-200'
              }`}
            >
              <User size={20} />
              Jugador
            </button>

            <button
              onClick={() => setActiveTab('group')}
              className={`flex-1 py-4 px-6 font-semibold flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'group'
                  ? 'bg-accent text-on-accent'
                  : 'bg-card-2 text-ink-2 hover:bg-gray-200'
              }`}
            >
              <Users size={20} />
              Grupo
            </button>

            <button
              onClick={() => setActiveTab('course')}
              className={`flex-1 py-4 px-6 font-semibold flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'course'
                  ? 'bg-accent text-on-accent'
                  : 'bg-card-2 text-ink-2 hover:bg-gray-200'
              }`}
            >
              <MapPin size={20} />
              Campo
            </button>
          </div>

          <div className="p-6">
            {activeTab === 'player' && (
              <div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-ink-2 mb-2">
                    Selecciona un jugador
                  </label>
                  <SelectMenu
                    value={selectedPlayer}
                    onChange={handlePlayerChange}
                    ariaLabel="Selecciona un jugador"
                    icon={<User size={19} />}
                    options={uniquePlayers.map((player) => ({ value: player, label: player }))}
                  />
                </div>

                {playerStats && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard
                        icon={<Trophy className="text-yellow-800" />}
                        label="Partidas"
                        value={playerStats.totalRounds}
                      />
                      <StatCard
                        icon={<Award className="text-accent-ink" />}
                        label="Victorias"
                        value={playerStats.wins}
                      />
                      <StatCard
                        icon={<TrendingUp className="text-blue-600" />}
                        label="Puntos Totales"
                        value={playerStats.totalPoints}
                        subtitle={groupStats ? `Posición: ${groupStats.playerStats.findIndex((p) => p.name === selectedPlayer) + 1}º` : undefined}
                      />
                      <StatCard
                        icon={<TrendingUp className="text-blue-600" />}
                        label="Puntos Promedio"
                        value={playerStats.averagePoints.toFixed(1)}
                      />
                    </div>

                    {playerStats.detailed && (
                      <>
                        <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                          <h3 className="text-xl font-bold text-blue-900 mb-4">Handicap</h3>
                          <div className="text-center">
                            <p className="text-4xl font-bold text-blue-700">
                              {playerStats.detailed.current_handicap?.toFixed(1) || '0.0'}
                            </p>
                            <p className="text-sm text-ink-3 mt-2">Handicap actual (9 hoyos)</p>
                          </div>
                        </div>

                        {renderHandicapEvolution()}

                        {playerStats.detailed.best_round?.points && (
                          <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg p-6 border border-yellow-300">
                            <h3 className="text-xl font-bold text-yellow-900 mb-4">Mejor Vuelta Histórica</h3>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-4xl font-bold text-yellow-700">
                                  {playerStats.detailed.best_round.points} puntos
                                </p>
                                <p className="text-sm text-ink-2 mt-2">
                                  {playerStats.detailed.best_round.course}
                                </p>
                                <p className="text-xs text-ink-3 mt-1">
                                  {new Date(playerStats.detailed.best_round.date).toLocaleDateString('es-ES')}
                                </p>
                              </div>
                              <Trophy size={64} className="text-yellow-500 opacity-50" />
                            </div>
                          </div>
                        )}

                        {playerStats.detailed.hole_results && (
                          <>
                            <div>
                              <h3 className="text-lg font-bold text-ink mb-4">
                                Distribución de Resultados
                                <span className="text-sm font-normal text-ink-3 ml-2">
                                  ({playerStats.detailed.total_holes_played || 0} hoyos jugados en {playerStats.totalRounds} partidas)
                                </span>
                              </h3>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                                  <p className="text-sm font-semibold text-purple-900">Eagles</p>
                                  <p className="text-3xl font-bold text-purple-700">
                                    {playerStats.detailed.hole_results.eagles || 0}
                                  </p>
                                </div>
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                                  <p className="text-sm font-semibold text-blue-900">Birdies</p>
                                  <p className="text-3xl font-bold text-blue-700">
                                    {playerStats.detailed.hole_results.birdies || 0}
                                  </p>
                                </div>
                                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-accent-ring">
                                  <p className="text-sm font-semibold text-title">Pares</p>
                                  <p className="text-3xl font-bold text-accent-ink">
                                    {playerStats.detailed.hole_results.pars || 0}
                                  </p>
                                </div>
                                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
                                  <p className="text-sm font-semibold text-yellow-900">Bogeys</p>
                                  <p className="text-3xl font-bold text-yellow-700">
                                    {playerStats.detailed.hole_results.bogeys || 0}
                                  </p>
                                </div>
                                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                                  <p className="text-sm font-semibold text-orange-900">Doble Bogeys</p>
                                  <p className="text-3xl font-bold text-orange-700">
                                    {playerStats.detailed.hole_results.double_bogeys || 0}
                                  </p>
                                </div>
                                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                                  <p className="text-sm font-semibold text-red-900">Triple Bogey+</p>
                                  <p className="text-3xl font-bold text-red-700">
                                    {playerStats.detailed.hole_results.triple_bogeys_plus || 0}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {renderAnalysisStats()}
                          </>
                        )}
                      </>
                    )}

                    {isDivend && (
                      <>
                        <div className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg p-6 border border-amber-200">
                          <div className="flex items-center gap-3 mb-4">
                            <Beer size={32} className="text-amber-700" />
                            <h3 className="text-xl font-bold text-amber-900">Balance de Cervezas</h3>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="text-center">
                              <p className="text-3xl font-bold text-accent-ink">+{playerStats.beersWon}</p>
                              <p className="text-sm text-ink-3">Cobradas</p>
                            </div>
                            <div className="text-center">
                              <p className="text-3xl font-bold text-red-600">-{playerStats.beersPaid}</p>
                              <p className="text-sm text-ink-3">Pagadas</p>
                            </div>
                            <div className="text-center">
                              <p
                                className={`text-3xl font-bold ${
                                  playerStats.beersWon - playerStats.beersPaid >= 0
                                    ? 'text-accent-ink'
                                    : 'text-red-600'
                                }`}
                              >
                                {playerStats.beersWon - playerStats.beersPaid >= 0 ? '+' : ''}
                                {playerStats.beersWon - playerStats.beersPaid}
                              </p>
                              <p className="text-sm text-ink-3">Balance</p>
                            </div>
                          </div>
                        </div>

                        {renderNoPasoRojasStats()}
                      </>
                    )}

                    {renderSpanishHandsStats()}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'group' && (
              <div>
                <h2 className="text-2xl font-bold text-ink mb-6">Estadísticas del Grupo</h2>

                {groupStats && (
                  <div className="space-y-6">
                    <button
                      onClick={() => setShowArchivedRoundsModal(true)}
                      className="w-full bg-accent-soft hover:bg-accent-soft rounded-lg p-4 border border-accent-ring transition-colors text-left"
                    >
                      <p className="text-ink-2">
                        <span className="font-bold text-2xl text-accent-ink">{historyRounds.length}</span>{' '}
                        partidas archivadas
                      </p>
                      <p className="text-xs text-accent-ink mt-1">Click para ver historial</p>
                    </button>

                    {isDivend && divendStats && (
                      <div>
                        <h3 className="text-lg font-bold text-ink mb-4">Premios Especiales Partideta dels divendres</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {divendStats.patrocinador && (
                            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-5 border-2 border-red-300 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Euro size={28} className="text-red-700" />
                                  <h4 className="text-lg font-bold text-red-900">"Patrocinador"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('patrocinador')}
                                  className="bg-red-700 hover:bg-red-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Más cervezas pagadas</p>
                              <p className="text-2xl font-bold text-red-800">{divendStats.patrocinador.name}</p>
                              <p className="text-lg text-red-600">{divendStats.patrocinador.value} cervezas</p>
                            </div>
                          )}

                          {divendStats.barraLibre && (
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-5 border-2 border-blue-300 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Beer size={28} className="text-blue-700" />
                                  <h4 className="text-lg font-bold text-blue-900">"Barra libre"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('barraLibre')}
                                  className="bg-blue-700 hover:bg-blue-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Más cervezas recibidas</p>
                              <p className="text-2xl font-bold text-blue-800">{divendStats.barraLibre.name}</p>
                              <p className="text-lg text-blue-600">{divendStats.barraLibre.value} cervezas</p>
                            </div>
                          )}

                          {divendStats.corto && (
                            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-5 border-2 border-orange-300 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Trophy size={28} className="text-orange-700" />
                                  <h4 className="text-lg font-bold text-orange-900">"Corto"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('corto')}
                                  className="bg-orange-700 hover:bg-orange-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">"No pasó de Rojas" más veces</p>
                              <p className="text-2xl font-bold text-orange-800">{divendStats.corto.name}</p>
                              <p className="text-lg text-orange-600">{divendStats.corto.value} veces</p>
                              {divendStats.corto.rounds_played !== undefined && (
                                <p className="text-xs text-ink-3 mt-1">en {divendStats.corto.rounds_played} partidas</p>
                              )}
                            </div>
                          )}

                          {divendStats.driverOro && (
                            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-5 border-2 border-yellow-400 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Award size={28} className="text-yellow-700" />
                                  <h4 className="text-lg font-bold text-yellow-900">"Driver de Oro"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('driverOro')}
                                  className="bg-yellow-700 hover:bg-yellow-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">"No pasó de Rojas" menos veces</p>
                              <p className="text-2xl font-bold text-yellow-800">{divendStats.driverOro.name}</p>
                              <p className="text-lg text-yellow-800">{divendStats.driverOro.value} veces</p>
                              {divendStats.driverOro.rounds_played !== undefined && (
                                <p className="text-xs text-ink-3 mt-1">en {divendStats.driverOro.rounds_played} partidas</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {phase2Stats && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-ink mb-4">Títulos y Rankings Históricos</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {phase2Stats.killer && (
                            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-5 border-2 border-yellow-400 shadow-soft">
                              <div className="flex items-center gap-3 mb-2">
                                <Zap size={28} className="text-yellow-700" />
                                <h4 className="text-lg font-bold text-yellow-900">"Killer"</h4>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Mejor vuelta histórica</p>
                              <p className="text-2xl font-bold text-yellow-800">{phase2Stats.killer.player_name}</p>
                              <p className="text-lg text-yellow-800">{phase2Stats.killer.best_score} puntos</p>
                              <p className="text-xs text-ink-3 mt-1">{phase2Stats.killer.course_name}</p>
                              <p className="text-xs text-ink-3">{typeof phase2Stats.killer.played_at === 'string' || typeof phase2Stats.killer.played_at === 'number' ? new Date(phase2Stats.killer.played_at).toLocaleDateString('es-ES') : ''}</p>
                            </div>
                          )}

                          {phase2Stats.paquete && (
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-5 border-2 border-line-2 shadow-soft">
                              <div className="flex items-center gap-3 mb-2">
                                <ThumbsDown size={28} className="text-ink-2" />
                                <h4 className="text-lg font-bold text-ink">"Paquete"</h4>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Peor vuelta histórica</p>
                              <p className="text-2xl font-bold text-ink">{phase2Stats.paquete.player_name}</p>
                              <p className="text-lg text-ink-3">{phase2Stats.paquete.worst_score} puntos</p>
                              <p className="text-xs text-ink-3 mt-1">{phase2Stats.paquete.course_name}</p>
                              <p className="text-xs text-ink-3">{typeof phase2Stats.paquete.played_at === 'string' || typeof phase2Stats.paquete.played_at === 'number' ? new Date(phase2Stats.paquete.played_at).toLocaleDateString('es-ES') : ''}</p>
                            </div>
                          )}

                          {phase2Stats.shark && (
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-5 border-2 border-blue-400 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Trophy size={28} className="text-blue-700" />
                                  <h4 className="text-lg font-bold text-blue-900">"Shark"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('shark')}
                                  className="bg-blue-700 hover:bg-blue-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Más partidas ganadas</p>
                              <p className="text-2xl font-bold text-blue-800">{phase2Stats.shark.player_name}</p>
                              <p className="text-lg text-blue-600">{phase2Stats.shark.total_wins} victorias</p>
                              <p className="text-xs text-ink-3 mt-1">{phase2Stats.shark.win_percentage}% de éxito en {phase2Stats.shark.total_rounds} partidas</p>
                            </div>
                          )}

                          {phase2Stats.viciado && (
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-5 border-2 border-purple-400 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Calendar size={28} className="text-purple-700" />
                                  <h4 className="text-lg font-bold text-purple-900">"Viciado"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('viciado')}
                                  className="bg-purple-700 hover:bg-purple-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Más partidas jugadas</p>
                              <p className="text-2xl font-bold text-purple-800">{phase2Stats.viciado.player_name}</p>
                              <p className="text-lg text-purple-600">{phase2Stats.viciado.total_rounds} partidas</p>
                              <p className="text-xs text-ink-3 mt-1">{phase2Stats.viciado.average_score} puntos promedio</p>
                            </div>
                          )}

                          {phase2Stats.francotirador && (
                            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-5 border-2 border-red-400 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Target size={28} className="text-red-700" />
                                  <h4 className="text-lg font-bold text-red-900">"Francotirador"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('francotirador')}
                                  className="bg-red-700 hover:bg-red-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Más eagles</p>
                              <p className="text-2xl font-bold text-red-800">{phase2Stats.francotirador.player_name}</p>
                              <p className="text-lg text-red-600">{phase2Stats.francotirador.total_eagles} eagles totales</p>
                              <p className="text-xs text-ink-3 mt-1">Mejor día: {phase2Stats.francotirador.best_single_day} eagles</p>
                            </div>
                          )}

                          {phase2Stats.maquina && (
                            <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-5 border-2 border-cyan-400 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Activity size={28} className="text-cyan-700" />
                                  <h4 className="text-lg font-bold text-cyan-900">"Máquina"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('maquina')}
                                  className="bg-cyan-700 hover:bg-cyan-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Más birdies</p>
                              <p className="text-2xl font-bold text-cyan-800">{phase2Stats.maquina.player_name}</p>
                              <p className="text-lg text-cyan-600">{phase2Stats.maquina.total_birdies} birdies totales</p>
                              <p className="text-xs text-ink-3 mt-1">Mejor día: {phase2Stats.maquina.best_single_day} birdies</p>
                            </div>
                          )}

                          {phase2Stats.amigoDelMasUno && (
                            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-5 border-2 border-amber-400 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <Award size={28} className="text-amber-700" />
                                  <h4 className="text-lg font-bold text-amber-900">"Amigo del +1"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('amigoDelMasUno')}
                                  className="bg-amber-700 hover:bg-amber-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Más bogeys</p>
                              <p className="text-2xl font-bold text-amber-800">{phase2Stats.amigoDelMasUno.player_name}</p>
                              <p className="text-lg text-amber-700">{phase2Stats.amigoDelMasUno.total_bogeys} bogeys totales</p>
                              <p className="text-xs text-ink-3 mt-1">Mejor día: {phase2Stats.amigoDelMasUno.best_single_day} bogeys</p>
                            </div>
                          )}

                          {phase2Stats.reyDelBosque && (
                            <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-5 border-2 border-rose-400 shadow-soft">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <TreePine size={28} className="text-rose-700" />
                                  <h4 className="text-lg font-bold text-rose-900">"Rey del Bosque"</h4>
                                </div>
                                <button
                                  onClick={() => openRankingModal('reyDelBosque')}
                                  className="bg-rose-700 hover:bg-rose-800 text-white p-2 rounded-lg transition-colors"
                                  title="Ver ranking completo"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Más doble bogeys y peores</p>
                              <p className="text-2xl font-bold text-rose-800">{phase2Stats.reyDelBosque.player_name}</p>
                              <p className="text-lg text-rose-600">{phase2Stats.reyDelBosque.total_double_bogeys_plus} doble bogeys+</p>
                              <p className="text-xs text-ink-3 mt-1">Mejor día: {phase2Stats.reyDelBosque.best_single_day} doble bogeys+</p>
                            </div>
                          )}

                          {phase2Stats.laPaliza && (
                            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-5 border-2 border-indigo-400 shadow-soft">
                              <div className="flex items-center gap-3 mb-2">
                                <Trophy size={28} className="text-indigo-700" />
                                <h4 className="text-lg font-bold text-indigo-900">Paliza</h4>
                              </div>
                              <p className="text-sm text-ink-2 mb-3">Mayor victoria</p>
                              <p className="text-xl font-bold text-indigo-800">{phase2Stats.laPaliza.winner_name}</p>
                              <p className="text-lg text-indigo-600">{phase2Stats.laPaliza.point_difference} puntos de diferencia</p>
                              <p className="text-xs text-ink-3 mt-1">{phase2Stats.laPaliza.winner_points} vs {phase2Stats.laPaliza.second_place_points} ({phase2Stats.laPaliza.second_place_name})</p>
                              <p className="text-xs text-ink-3">{phase2Stats.laPaliza.course_name}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-lg font-bold text-ink mb-4">Clasificación General</h3>
                      <div className="space-y-3">
                        {groupStats.playerStats.map((player, index) => (
                          <div
                            key={player.name}
                            className={`p-4 rounded-lg border ${
                              index === 0
                                ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-yellow-400'
                                : index === 1
                                ? 'bg-card-2 border-line-2'
                                : index === 2
                                ? 'bg-gradient-to-r from-orange-100 to-orange-50 border-orange-400'
                                : 'bg-card border-line'
                            }`}
                          >
                            <div className="flex items-center justify-between">
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
                                  <p className="font-bold text-lg text-ink">{player.name}</p>
                                  <div className="flex gap-4 text-sm text-ink-3">
                                    <span>{player.totalRounds} partidas</span>
                                    <span>{player.wins} victorias</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-3xl font-bold text-accent-ink">{player.totalPoints}</p>
                                <p className="text-xs text-ink-3">
                                  {player.averagePoints.toFixed(1)} promedio
                                </p>
                                {isDivend && (
                                  <div className="flex items-center gap-1 justify-end mt-1">
                                    <Beer size={16} className="text-amber-700" />
                                    <p
                                      className={`text-sm font-semibold ${
                                        player.beerBalance >= 0 ? 'text-accent-ink' : 'text-red-600'
                                      }`}
                                    >
                                      {player.beerBalance >= 0 ? '+' : ''}
                                      {player.beerBalance}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'course' && (
              <div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-ink-2 mb-2">
                    Selecciona un campo
                  </label>
                  <SelectMenu
                    value={selectedCourse}
                    onChange={handleCourseChange}
                    ariaLabel="Selecciona un campo"
                    icon={<MapPin size={19} />}
                    options={uniqueCourses.map((course) => ({ value: course, label: course }))}
                  />
                </div>

                {courseStats && courseStats.totalRounds > 0 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard
                        icon={<MapPin className="text-accent-ink" />}
                        label="Partidas"
                        value={courseStats.totalRounds}
                      />
                      <StatCard
                        icon={<TrendingUp className="text-blue-600" />}
                        label="Promedio Ganador"
                        value={courseStats.averageWinningScore.toFixed(1)}
                      />
                      <StatCard
                        icon={<Award className="text-accent-ink" />}
                        label="Puntaje Más Alto"
                        value={courseStats.highestScore}
                      />
                      <StatCard
                        icon={<TrendingUp className="text-red-600" />}
                        label="Puntaje Más Bajo"
                        value={courseStats.lowestScore}
                      />
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-ink mb-4">Top 5 Jugadores</h3>
                      <div className="space-y-2">
                        {courseStats.topPlayers.map((player, index) => (
                          <div
                            key={player.name}
                            className="p-4 rounded-lg bg-card border border-line flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold text-ink-3">{index + 1}.</span>
                              <div>
                                <p className="font-semibold text-ink">{player.name}</p>
                                <p className="text-sm text-ink-3">{player.totalRounds} partidas</p>
                              </div>
                            </div>
                            <p className="text-2xl font-bold text-accent-ink">
                              {player.averageScore.toFixed(1)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                      {courseStats.hoyoMuerte && (
                        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-5 border-2 border-red-300 shadow-soft">
                          <h4 className="text-lg font-bold text-red-900 mb-2">Hoyo de la Muerte</h4>
                          <p className="text-sm text-ink-2 mb-3">Más bogeys y dobles</p>
                          <p className="text-3xl font-bold text-red-800">Hoyo #{courseStats.hoyoMuerte.hole_number}</p>
                          <p className="text-sm text-ink-3 mt-2">Par {courseStats.hoyoMuerte.par}</p>
                          <div className="mt-3 space-y-1">
                            <p className="text-xs text-ink-2">
                              <span className="font-semibold">{courseStats.hoyoMuerte.total_bad_scores}</span> malos golpes de <span className="font-semibold">{courseStats.hoyoMuerte.total_plays}</span> jugadas
                            </p>
                            <p className="text-xs text-ink-3">
                              {courseStats.hoyoMuerte.bogeys} bogeys, {courseStats.hoyoMuerte.double_bogeys} dobles, {courseStats.hoyoMuerte.triple_or_worse} triples+
                            </p>
                          </div>
                        </div>
                      )}

                      {courseStats.hoyoGloria && (
                        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-5 border-2 border-yellow-300 shadow-soft">
                          <h4 className="text-lg font-bold text-yellow-900 mb-2">Hoyo de la Gloria</h4>
                          <p className="text-sm text-ink-2 mb-3">Más birdies y eagles</p>
                          <p className="text-3xl font-bold text-yellow-800">Hoyo #{courseStats.hoyoGloria.hole_number}</p>
                          <p className="text-sm text-ink-3 mt-2">Par {courseStats.hoyoGloria.par}</p>
                          <div className="mt-3 space-y-1">
                            <p className="text-xs text-ink-2">
                              <span className="font-semibold">{courseStats.hoyoGloria.total_good_scores}</span> buenos golpes de <span className="font-semibold">{courseStats.hoyoGloria.total_plays}</span> jugadas
                            </p>
                            <p className="text-xs text-ink-3">
                              {courseStats.hoyoGloria.eagles} eagles, {courseStats.hoyoGloria.birdies} birdies
                            </p>
                          </div>
                        </div>
                      )}

                      {courseStats.mejorRonda && (
                        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-5 border-2 border-accent-ring shadow-soft">
                          <h4 className="text-lg font-bold text-title mb-2">Mejor Ronda</h4>
                          <p className="text-sm text-ink-2 mb-3">Record del campo</p>
                          <p className="text-2xl font-bold text-accent-ink">{courseStats.mejorRonda.player_name}</p>
                          <p className="text-3xl font-bold text-accent-ink mt-2">{courseStats.mejorRonda.best_score} pts</p>
                          <p className="text-xs text-ink-3 mt-1">
                            {new Date(courseStats.mejorRonda.played_at).toLocaleDateString('es-ES')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {rankingModal.isOpen && rankingModal.type && (
          <AwardRankingModal
            isOpen={rankingModal.isOpen}
            onClose={closeRankingModal}
            title={
              rankingModal.type === 'patrocinador' ? '"Patrocinador"' :
              rankingModal.type === 'barraLibre' ? '"Barra Libre"' :
              rankingModal.type === 'corto' ? '"Corto"' :
              rankingModal.type === 'driverOro' ? '"Driver de Oro"' :
              rankingModal.type === 'shark' ? '"Shark"' :
              rankingModal.type === 'viciado' ? '"Viciado"' :
              rankingModal.type === 'francotirador' ? '"Francotirador"' :
              rankingModal.type === 'maquina' ? '"Máquina"' :
              rankingModal.type === 'amigoDelMasUno' ? '"Amigo del +1"' :
              '"Rey del Bosque"'
            }
            description={
              rankingModal.type === 'patrocinador' ? 'Ranking de jugadores con más cervezas pagadas (no incluidas "no pasar de rojas")' :
              rankingModal.type === 'barraLibre' ? 'Ranking de jugadores con más cervezas recibidas' :
              rankingModal.type === 'corto' ? 'Ranking de jugadores con más "No pasó de Rojas"' :
              rankingModal.type === 'driverOro' ? 'Ranking de jugadores con menos "No pasó de Rojas"' :
              rankingModal.type === 'shark' ? 'Ranking de jugadores con más victorias' :
              rankingModal.type === 'viciado' ? 'Ranking de jugadores con más partidas jugadas y HCP promedio' :
              rankingModal.type === 'francotirador' ? 'Ranking de jugadores con más eagles' :
              rankingModal.type === 'maquina' ? 'Ranking de jugadores con más birdies' :
              rankingModal.type === 'amigoDelMasUno' ? 'Ranking de jugadores con más bogeys' :
              'Ranking de jugadores con más doble bogeys y superiores (triple bogey+)'
            }
            ranking={rankingModal.data}
            valueLabel={
              rankingModal.type === 'patrocinador' || rankingModal.type === 'barraLibre' ? 'cervezas' :
              rankingModal.type === 'corto' || rankingModal.type === 'driverOro' ? 'veces' :
              rankingModal.type === 'shark' ? 'victorias' :
              rankingModal.type === 'viciado' ? 'partidas' :
              rankingModal.type === 'francotirador' ? 'eagles' :
              rankingModal.type === 'maquina' ? 'birdies' :
              rankingModal.type === 'amigoDelMasUno' ? 'bogeys' :
              'doble bogeys+'
            }
            colorScheme={
              rankingModal.type === 'patrocinador' ? {
                bg: 'bg-gradient-to-br from-red-50 to-red-100',
                border: 'border-red-300',
                text: 'text-red-900',
                accent: 'bg-red-400',
              } :
              rankingModal.type === 'barraLibre' ? {
                bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
                border: 'border-blue-300',
                text: 'text-blue-900',
                accent: 'bg-blue-400',
              } :
              rankingModal.type === 'corto' ? {
                bg: 'bg-gradient-to-br from-orange-50 to-orange-100',
                border: 'border-orange-300',
                text: 'text-orange-900',
                accent: 'bg-orange-400',
              } :
              rankingModal.type === 'driverOro' ? {
                bg: 'bg-gradient-to-br from-yellow-50 to-yellow-100',
                border: 'border-yellow-400',
                text: 'text-yellow-900',
                accent: 'bg-yellow-400',
              } :
              rankingModal.type === 'shark' ? {
                bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
                border: 'border-blue-400',
                text: 'text-blue-900',
                accent: 'bg-blue-400',
              } :
              rankingModal.type === 'viciado' ? {
                bg: 'bg-gradient-to-br from-purple-50 to-purple-100',
                border: 'border-purple-400',
                text: 'text-purple-900',
                accent: 'bg-purple-400',
              } :
              rankingModal.type === 'francotirador' ? {
                bg: 'bg-gradient-to-br from-red-50 to-red-100',
                border: 'border-red-400',
                text: 'text-red-900',
                accent: 'bg-red-400',
              } :
              rankingModal.type === 'maquina' ? {
                bg: 'bg-gradient-to-br from-cyan-50 to-cyan-100',
                border: 'border-cyan-400',
                text: 'text-cyan-900',
                accent: 'bg-cyan-400',
              } :
              rankingModal.type === 'amigoDelMasUno' ? {
                bg: 'bg-gradient-to-br from-amber-50 to-amber-100',
                border: 'border-amber-400',
                text: 'text-amber-900',
                accent: 'bg-amber-400',
              } :
              {
                bg: 'bg-gradient-to-br from-rose-50 to-rose-100',
                border: 'border-rose-400',
                text: 'text-rose-900',
                accent: 'bg-rose-400',
              }
            }
          />
        )}

        {showArchivedRoundsModal && !selectedArchivedRound && (
          <ArchivedRoundsModal
            rounds={historyRounds}
            onClose={() => setShowArchivedRoundsModal(false)}
            onSelectRound={(round) => setSelectedArchivedRound(round)}
          />
        )}

        {selectedArchivedRound && (
          <ArchivedRoundDetailModal
            round={selectedArchivedRound}
            onClose={() => {
              setSelectedArchivedRound(null);
              setShowArchivedRoundsModal(false);
            }}
            onBack={() => setSelectedArchivedRound(null)}
          />
        )}
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, subtitle }) => {
  return (
    <div className="bg-card border border-line rounded-lg p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <p className="text-sm text-ink-3 mb-1">{label}</p>
      <p className="text-2xl font-bold text-ink">{value}</p>
      {subtitle && <p className="text-xs text-ink-3 mt-1">{subtitle}</p>}
    </div>
  );
};
