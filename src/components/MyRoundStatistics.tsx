import { NavigationButton } from './NavigationButton';
import { OmikiLoadingScreen } from './OmikiSpinner';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SelectMenu } from './SelectMenu';
import { ThemeToggle } from './ThemeToggle';
import { Activity, Award, Calendar, ChevronDown, Flame, Target, TrendingDown, Trophy } from 'lucide-react';
import { golfService } from '../services/golfService';
import { findAccountPlayer, type CareerAccount } from '../utils/careerStats';
import { computeMyRoundStats, type MyRoundDistribution, type MyRoundStats } from '../utils/myRoundStats';
import { scoreResultChip, scoreResultFromPoints, scoreResultLabel } from '../utils/scoreColors';
import type { GolfCourse, QuickPlayCompletedRound } from '../types';

// Mis partidas: estadísticas de una partida concreta centradas en el jugador de la cuenta.

interface MyRoundStatisticsProps {
  account: CareerAccount;
  onBack: () => void;
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

const distributionItems: Array<{ key: keyof MyRoundDistribution; label: string; chip: string }> = [
  { key: 'eagle', label: 'Eagles+', chip: scoreResultChip.eagle },
  { key: 'birdie', label: 'Birdies', chip: scoreResultChip.birdie },
  { key: 'par', label: 'Pares', chip: scoreResultChip.par },
  { key: 'bogey', label: 'Bogeys', chip: scoreResultChip.bogey },
  { key: 'double', label: 'Dobles', chip: scoreResultChip.double },
  { key: 'triplePlus', label: 'Triples+', chip: 'bg-slate-900 text-white ring-red-500' },
];

const pointsClass = (points: number) =>
  points >= 4 ? 'statistics-table-positive' :
  points === 3 ? 'statistics-table-accent' :
  points === 2 ? 'statistics-table-text' :
  points === 1 ? 'statistics-table-warning' :
  'statistics-table-negative';

export const MyRoundStatistics: React.FC<MyRoundStatisticsProps> = ({ account, onBack, messagesButton }) => {
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
          setSelectedRoundId(rounds[0].id);
          await loadRound(rounds[0].id);
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
  }, [loadRound]);

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
                <div className="rounded-lg bg-white/35 p-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide">Mis puntos</dt>
                  <dd className="mt-1 text-3xl font-black leading-none">{myStats.points}</dd>
                </div>
                <div className="rounded-lg bg-white/35 p-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide">HCP de juego</dt>
                  <dd className="mt-1 text-3xl font-black leading-none">{myStats.handicap}</dd>
                </div>
                <div className="rounded-lg bg-white/25 p-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide">Vs Par Personal</dt>
                  <dd className={`mt-1 text-3xl font-black leading-none ${myStats.toPar.value === 0 ? 'text-yellow-950' : myStats.toPar.value < 0 ? 'text-green-800' : 'text-red-700'}`}>
                    {myStats.toPar.display}
                  </dd>
                </div>
              </dl>
            </section>

            {/* B. MIS HIGHLIGHTS */}
            <section aria-labelledby="my-highlights" className="statistics-panel rounded-2xl p-3 md:p-5">
              <h2 id="my-highlights" className="statistics-table-title mb-3 text-xl font-black">Mis highlights</h2>
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
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {distributionItems.map((item) => (
                  <li key={item.key} className="statistics-table-line flex flex-col items-center gap-1 rounded-xl border p-2">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-base font-black ring-1 ${item.chip}`}>
                      {myStats.distribution[item.key]}
                    </span>
                    <span className="statistics-table-text text-xs font-semibold">{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="my-points" className="statistics-panel rounded-2xl p-3 md:p-5">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 id="my-points" className="statistics-table-title text-xl font-black">Puntos por hoyo</h2>
                <p className="statistics-table-accent text-sm font-black">Total {myStats.points}</p>
              </div>
              <ol className="grid grid-cols-9 gap-1">
                {myStats.holes.map((hole) => (
                  <li key={hole.holeNumber} className="statistics-table-line flex flex-col items-center rounded-lg border py-1">
                    <span className="statistics-table-text text-[10px] opacity-70">{hole.holeNumber}</span>
                    <span className={`text-base font-black ${hole.played ? pointsClass(hole.points) : 'statistics-table-text'}`}>
                      {hole.played ? hole.points : '–'}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="my-card" className="statistics-panel rounded-2xl p-3 md:p-5">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 id="my-card" className="statistics-table-title text-xl font-black">Tarjeta (golpes)</h2>
                <p className="statistics-table-accent text-sm font-black">Total {myStats.totalGrossStrokes}</p>
              </div>
              <ol className="grid grid-cols-9 gap-1">
                {myStats.holes.map((hole) => {
                  const result = scoreResultFromPoints(hole.points, hole.abandoned);
                  return (
                    <li key={hole.holeNumber} className="flex flex-col items-center gap-0.5">
                      <span className="statistics-table-text text-[10px] opacity-70">{hole.holeNumber}</span>
                      {hole.played ? (
                        <span title={scoreResultLabel[result]} className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ring-1 ${scoreResultChip[result]}`}>
                          {hole.grossStrokes}
                        </span>
                      ) : (
                        <span className="statistics-table-text inline-flex h-8 w-8 items-center justify-center text-sm font-bold">–</span>
                      )}
                    </li>
                  );
                })}
              </ol>
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
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
