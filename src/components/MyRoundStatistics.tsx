import { NavigationButton } from './NavigationButton';
import { OmikiLoadingScreen } from './OmikiSpinner';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SelectMenu } from './SelectMenu';
import { ThemeToggle } from './ThemeToggle';
import { Activity, Award, BarChart3, Calendar, ChevronDown, Flame, Target, TrendingDown, Trophy } from 'lucide-react';
import { golfService } from '../services/golfService';
import { findAccountPlayer, type CareerAccount } from '../utils/careerStats';
import { buildEvolution, computeMyRoundStats, type MyRoundDistribution, type MyRoundStats } from '../utils/myRoundStats';
import { CumulativePointsChart, StrokesPointsChart } from './MyRoundCharts';
import { scoreResultBar, scoreResultChip, scoreResultFromPoints, scoreResultLabel } from '../utils/scoreColors';
import type { GolfCourse, QuickPlayCompletedRound } from '../types';

// Mis partidas: estadísticas de una partida concreta centradas en el jugador de la cuenta.

interface MyRoundStatisticsProps {
  account: CareerAccount;
  onBack: () => void;
  /** Abre las estadísticas de la partida para todos los jugadores (como desde Crear/ver partida). */
  onViewRoundStatistics?: (roundId: string) => void;
  /** Partida que se mostraba antes de abrir sus estadísticas, para volver a ella. */
  initialRoundId?: string | null;
  messagesButton?: React.ReactNode;
}

interface AvailableRound {
  id: string;
  created_at: string;
  status: string;
  game_mode?: string;
}

const modeLabel = (mode?: string) => {
  switch (mode) {
    case 'match': return 'Match';
    case 'sindicato': return 'Sindicato';
    case 'parejas': return 'Parejas';
    default: return 'Stableford';
  }
};

const formatRoundLabel = (round: AvailableRound) => `${new Date(round.created_at).toLocaleDateString('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})} - ${new Date(round.created_at).toLocaleTimeString('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
})} · ${modeLabel(round.game_mode)}`;

const toParClass = (value: number) => value === 0 ? 'statistics-table-text' : value < 0 ? 'statistics-table-positive' : 'statistics-table-negative';

// Mismas barras que «Resultados por hoyo (neto)» de Mis estadísticas, con dobles y triples+ por separado.
const distributionItems: Array<{ key: keyof MyRoundDistribution; label: string; color: string }> = [
  { key: 'eagle', label: scoreResultLabel.eagle, color: scoreResultBar.eagle },
  { key: 'birdie', label: scoreResultLabel.birdie, color: scoreResultBar.birdie },
  { key: 'par', label: scoreResultLabel.par, color: scoreResultBar.par },
  { key: 'bogey', label: scoreResultLabel.bogey, color: scoreResultBar.bogey },
  { key: 'double', label: 'Doble bogey', color: scoreResultBar.double },
  { key: 'triplePlus', label: 'Triple o peor', color: 'bg-black ring-1 ring-inset ring-red-500' },
];

export const MyRoundStatistics: React.FC<MyRoundStatisticsProps> = ({ account, onBack, onViewRoundStatistics, initialRoundId = null, messagesButton }) => {
  const [loading, setLoading] = useState(true);
  const [availableRounds, setAvailableRounds] = useState<AvailableRound[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [roundData, setRoundData] = useState<QuickPlayCompletedRound | null>(null);
  const [myStats, setMyStats] = useState<MyRoundStats | null>(null);
  const [showStandings, setShowStandings] = useState(false);
  const [error, setError] = useState('');
  // App crea el objeto account en cada render: solo sus valores deben recargar la pantalla.
  const { userId, nick, displayName } = account;
  const latestRequest = useRef(0);

  const loadRound = useCallback(async (roundId: string) => {
    const request = ++latestRequest.current;
    setLoading(true);
    setError('');
    setShowStandings(false);
    try {
      const data = await golfService.getQuickPlayCompletedRound(roundId);
      if (request !== latestRequest.current) return;
      setRoundData(data);
      const me = data ? findAccountPlayer(data.players, { userId, nick, displayName }) : null;
      const player = me ? data?.players.find((item) => item.id === me.id) ?? null : null;
      if (data && player) {
        const summary = golfService.calculateQuickPlayAwards(
          data.players,
          data.scores,
          data.holes,
          data.round?.game_mode || 'stableford',
          data.round?.decided_result || null,
        );
        setMyStats(computeMyRoundStats(player, data.players, data.scores, data.holes, summary));
      } else {
        setMyStats(null);
      }
    } catch (err) {
      if (request !== latestRequest.current) return;
      console.error('Error cargando mis estadísticas de la partida:', err);
      setRoundData(null);
      setMyStats(null);
      setError('No se han podido cargar las estadísticas de esta partida.');
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [userId, nick, displayName]);

  useEffect(() => {
    const init = async () => {
      try {
        const rounds = await golfService.getAvailableRoundsForStats();
        setAvailableRounds(rounds);
        if (rounds.length > 0) {
          const firstRoundId = initialRoundId && rounds.some((round) => round.id === initialRoundId) ? initialRoundId : rounds[0].id;
          setSelectedRoundId(firstRoundId);
          await loadRound(firstRoundId);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error cargando la lista de mis partidas:', err);
        setError('No se ha podido cargar la lista de partidas.');
        setLoading(false);
      }
    };
    void init();
  }, [loadRound, initialRoundId]);

  const handleSelectRound = (roundId: string) => {
    setSelectedRoundId(roundId);
    void loadRound(roundId);
  };

  const course: GolfCourse | null = roundData?.course ?? null;
  const gameMode = roundData?.round?.game_mode || 'stableford';

  const header = (
    <div className="mb-6 flex flex-col items-center gap-4">
      <div className="relative flex min-h-11 w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <NavigationButton destination="back"
            onClick={onBack}
            className="bg-card hover:bg-card-2 border border-line text-ink font-bold py-2 px-3 rounded-lg flex items-center gap-2 transition-all hover:scale-105"
          />
          <ThemeToggle />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {messagesButton}
        </div>
        <div className="w-[5.5rem]" aria-hidden="true" />
      </div>

      <div className="text-center flex flex-col items-center gap-2">
        <h1 className="text-3xl md:text-5xl font-black text-title">Mis partidas</h1>

        {availableRounds.length > 0 && (
          <p className="mt-2 whitespace-nowrap text-sm font-semibold text-ink">Selecciona la partida a consultar</p>
        )}

        {availableRounds.length > 0 && (
          <SelectMenu
            className="max-w-md"
            value={selectedRoundId || availableRounds[0].id}
            onChange={handleSelectRound}
            ariaLabel="Partida a mostrar"
            icon={<Calendar size={19} />}
            options={availableRounds.map((round) => ({ value: round.id, label: formatRoundLabel(round) }))}
          />
        )}

        {roundData && (
          <p className="text-accent-ink font-semibold text-xs md:text-sm mt-1">
            {course?.name} · <span className="uppercase tracking-wider">{modeLabel(gameMode)}</span>
          </p>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="relative">
        <div className="absolute right-4 top-4 z-10">{messagesButton}</div>
        <OmikiLoadingScreen label="Cargando tus estadísticas…" />
      </div>
    );
  }

  const evolution = myStats ? buildEvolution(myStats.holes) : [];

  const emptyMessage = error
    || (availableRounds.length === 0 ? 'Todavía no tienes partidas finalizadas. Cuando termines una, aquí verás cómo jugaste.' : '')
    || (!myStats ? 'No te hemos encontrado entre los jugadores de esta partida.' : '');

  return (
    <div className="statistics-theme min-h-screen bg-app text-ink p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {header}

        {emptyMessage || !myStats ? (
          <div role="status" className="rounded-2xl border border-line bg-card p-6 text-center text-ink shadow-card">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-line bg-card p-3 md:p-6 shadow-card">

            {/* A. MI POSICIÓN */}
            <section aria-labelledby="my-position" className="gold-card rounded-2xl border-2 border-yellow-300 bg-gradient-to-br from-yellow-400 to-amber-500 p-3 text-yellow-950 shadow-xl">
              <h2 id="my-position" className="sr-only">Mi posición en la partida</h2>
              <div className="mb-2 flex items-center justify-center gap-2">
                <Trophy size={20} aria-hidden="true" />
                <p className="text-2xl font-black leading-none">
                  {myStats.position > 0 ? `${myStats.position}.º de ${myStats.totalPlayers}` : `— de ${myStats.totalPlayers}`}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {/* El valor va a la base de la ficha: queda alineado aunque la etiqueta ocupe una o dos líneas. */}
                <div className="flex flex-col rounded-lg bg-white/35 p-2">
                  <dt className="text-[11px] font-semibold uppercase leading-tight tracking-wide">Mis puntos</dt>
                  <dd className="mt-auto pt-1 text-3xl font-black leading-none">{myStats.points}</dd>
                </div>
                <div className="flex flex-col rounded-lg bg-white/35 p-2">
                  <dt className="text-[11px] font-semibold uppercase leading-tight tracking-wide">HCP de juego</dt>
                  <dd className="mt-auto pt-1 text-3xl font-black leading-none">{myStats.handicap}</dd>
                </div>
                <div className="flex flex-col rounded-lg bg-white/25 p-2">
                  <dt className="text-[11px] font-semibold uppercase leading-tight tracking-wide">Vs Par Personal</dt>
                  <dd className={`mt-auto pt-1 text-3xl font-black leading-none ${myStats.toPar.value === 0 ? 'text-yellow-950' : myStats.toPar.value < 0 ? 'text-green-800' : 'text-red-700'}`}>
                    {myStats.toPar.display}
                  </dd>
                </div>
              </dl>
            </section>

            {/* B. MIS HIGHLIGHTS */}
            <section aria-labelledby="my-highlights" className="statistics-panel rounded-2xl p-3 md:p-5">
              <h2 id="my-highlights" className="statistics-table-title mb-3 text-xl font-black">Mis Momentazos</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-3 text-white shadow-xl">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/80"><Target size={14} aria-hidden="true" /> Mejor hoyo</p>
                  <p className="mt-1 text-base font-black leading-tight">{myStats.bestHole ? `Hoyo ${myStats.bestHole.holeNumber}` : '—'}</p>
                  <p className="text-sm font-semibold text-blue-100">{myStats.bestHole ? `${myStats.bestHole.points} pts` : ''}</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 p-3 text-white shadow-xl">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/80"><TrendingDown size={14} aria-hidden="true" /> Peor hoyo</p>
                  <p className="mt-1 text-base font-black leading-tight">{myStats.worstHole ? `Hoyo ${myStats.worstHole.holeNumber}` : '—'}</p>
                  <p className="text-sm font-semibold text-rose-100">{myStats.worstHole ? `${myStats.worstHole.points} pts` : ''}</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 p-3 text-white shadow-xl">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/80"><Flame size={14} aria-hidden="true" /> Birdies</p>
                  <p className="mt-1 text-base font-black leading-tight">{myStats.birdies}</p>
                  <p className="text-sm font-semibold text-amber-100">{myStats.birdies === 1 ? 'birdie' : 'birdies'}</p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-3 text-white shadow-xl">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/80"><Activity size={14} aria-hidden="true" /> Mayor variación</p>
                  <p className="mt-1 text-base font-black leading-tight">{myStats.variability} pts</p>
                  <p className="text-sm font-semibold text-purple-100">entre mi mejor y peor hoyo</p>
                </div>
              </div>

              <h3 className="statistics-table-title mt-4 mb-2 text-base font-black">Mis premios</h3>
              {myStats.awards.length > 0 ? (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {myStats.awards.map((award) => (
                    <li key={award.key} className="flex items-center gap-2 rounded-xl border-2 border-yellow-400 bg-yellow-500/15 px-3 py-2">
                      <Award size={18} className="shrink-0 text-yellow-500" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="statistics-table-text text-sm font-black leading-tight">{award.title}</p>
                        <p className="statistics-table-text text-xs opacity-80">{award.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="statistics-table-text text-sm opacity-80">En esta partida no te llevaste ningún premio.</p>
              )}
            </section>

            {/* C. MIS TABLAS */}
            <section aria-labelledby="my-to-par" className="statistics-panel rounded-2xl p-3 md:p-5">
              <h2 id="my-to-par" className="statistics-table-title mb-3 text-xl font-black">Detalle contra par</h2>
              <ul className="space-y-2">
                {distributionItems.map((item) => {
                  const value = myStats.distribution[item.key];
                  const maxBar = Math.max(1, ...distributionItems.map((entry) => myStats.distribution[entry.key]));
                  return (
                    <li key={item.key} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                      <span className="statistics-table-text">{item.label}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-card-2">
                        <span className={`block h-full rounded-full ${item.color}`} style={{ width: `${(value / maxBar) * 100}%` }} />
                      </span>
                      <span className="statistics-table-text text-right font-semibold">{value}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Golpes con el color del resultado y, debajo, los puntitos de golpes de ventaja, como en la tarjeta. */}
            <section aria-labelledby="my-card" className="statistics-panel rounded-2xl p-3 md:p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="my-card" className="statistics-table-title text-xl font-black">Mi tarjeta</h2>
                <p className="statistics-table-accent text-sm font-black">{myStats.totalGrossStrokes} golpes · {myStats.points} puntos</p>
              </div>
              <ol className="grid grid-cols-9 gap-1">
                {myStats.holes.map((hole) => {
                  const result = scoreResultFromPoints(hole.points, hole.abandoned);
                  return (
                    <li key={hole.holeNumber} className="flex flex-col items-center gap-0.5">
                      {/* Cabecera como en la tarjeta de anotación: número del hoyo y P(par)•H(hándicap del hoyo). */}
                      <span className="statistics-table-text text-xs font-bold leading-none">{hole.holeNumber}</span>
                      <span className="statistics-table-text whitespace-nowrap text-[9px] leading-none opacity-70">P{hole.par}•H{hole.strokeIndex}</span>
                      {hole.played ? (
                        <span title={scoreResultLabel[result]} className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ring-1 ${scoreResultChip[result]}`}>
                          {hole.grossStrokes}
                        </span>
                      ) : (
                        <span className="statistics-table-text inline-flex h-8 w-8 items-center justify-center text-sm font-bold">–</span>
                      )}
                      {/* Puntitos de golpes de ventaja (HCP del jugador en esta partida), del mismo tamaño que en la tarjeta. */}
                      <span className="flex h-1 min-h-[4px] gap-0.5" aria-label={`${hole.strokesReceived} golpes de ventaja`}>
                        {hole.strokesReceived > 0 && Array.from({ length: hole.strokesReceived }).map((_, index) => (
                          <span
                            key={index}
                            className="h-1 w-1 rounded-full bg-blue-500"
                            title={`${hole.strokesReceived} golpe${hole.strokesReceived > 1 ? 's' : ''} recibido${hole.strokesReceived > 1 ? 's' : ''}`}
                          />
                        ))}
                      </span>
                      <span className={`text-xs font-black leading-none ${hole.played ? 'statistics-table-accent' : 'statistics-table-text opacity-50'}`} title={`${hole.points} puntos en el hoyo ${hole.holeNumber}`}>
                        {hole.played ? hole.points : '–'}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* Evolución de la partida: dos propuestas para comparar antes de quedarnos con una. */}
            <section aria-labelledby="my-evolution" className="statistics-panel rounded-2xl p-3 md:p-5">
              <h2 id="my-evolution" className="statistics-table-title mb-3 text-xl font-black">Evolución de la partida</h2>
              <h3 className="statistics-table-text mb-1 text-sm font-bold">Puntos acumulados frente a tu hándicap</h3>
              <CumulativePointsChart evolution={evolution} />
              <h3 className="statistics-table-text mt-5 mb-1 text-sm font-bold">Golpes y puntos por hoyo</h3>
              <StrokesPointsChart evolution={evolution} />
            </section>

            {/* D. CLASIFICACIÓN COMPLETA (colapsada por defecto) */}
            <section className="statistics-panel rounded-2xl p-3 md:p-5">
              <button
                type="button"
                onClick={() => setShowStandings((open) => !open)}
                aria-expanded={showStandings}
                aria-controls="my-round-standings"
                className="statistics-table-text statistics-table-line flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left font-bold"
              >
                {showStandings ? 'Ocultar clasificación completa' : 'Ver clasificación completa'}
                <ChevronDown size={18} className={`transition-transform ${showStandings ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {showStandings && (
                <div id="my-round-standings" className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="statistics-table-line border-b-2">
                        <th className="statistics-table-text p-2 text-left font-bold">Pos.</th>
                        <th className="statistics-table-text p-2 text-left font-bold">Jugador</th>
                        <th className="statistics-table-text p-2 text-center font-bold">HCP</th>
                        <th className="statistics-table-text p-2 text-center font-bold">Puntos</th>
                        <th className="statistics-table-text p-2 text-center font-bold">Vs Par</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myStats.standings.map((row) => (
                        <tr key={row.playerId} className={`statistics-table-line border-b ${row.isMe ? 'bg-yellow-400/20' : ''}`}>
                          <td className="statistics-table-text p-2 font-bold">{row.position}</td>
                          <td className="statistics-table-text p-2 font-semibold">{row.name}{row.isMe && <span className="ml-1 text-xs opacity-70">(yo)</span>}</td>
                          <td className="statistics-table-text p-2 text-center">{row.handicap}</td>
                          <td className="statistics-table-accent p-2 text-center font-bold">{row.points}</td>
                          <td className={`p-2 text-center font-bold ${toParClass(row.toPar.value)}`}>{row.toPar.display}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {onViewRoundStatistics && selectedRoundId && (
                    <button
                      type="button"
                      onClick={() => onViewRoundStatistics(selectedRoundId)}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 font-bold text-white transition-colors hover:bg-emerald-500"
                    >
                      <BarChart3 size={18} aria-hidden="true" /> Ver estadísticas
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
