import React, { useEffect, useState } from 'react';
import { Activity, Award, BarChart3, Calendar, ChevronRight, Flag, MapPin, Target, TrendingUp, Trophy } from 'lucide-react';
import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import { TrendLineChart } from './CareerCharts';
import { golfService } from '../services/golfService';
import { computeCareerStats, type CareerAccount, type CareerCoursePerformance, type CareerResultDistribution, type CareerStats } from '../utils/careerStats';
import { scoreResultBar, scoreResultLabel } from '../utils/scoreColors';
import type { GameMode } from '../types';

// Mis estadísticas acumuladas: tendencias, patrones y comparaciones de todas las partidas (no un listado).

interface CareerStatisticsProps {
  account: CareerAccount;
  onBack: () => void;
  /** Abre Mis partidas; con una partida, directamente en ella. */
  onOpenMyRounds?: (roundId?: string) => void;
  messagesButton?: React.ReactNode;
}

const modeLabels: Record<GameMode, string> = {
  stableford: 'Stableford',
  match: 'Match Play',
  sindicato: 'Sindicato',
  parejas: 'Parejas',
};
const shortDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const axisDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const trendDate = (iso: string) => axisDate.format(new Date(iso));
const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const formatNumber = (value: number | null) => value === null ? '—' : decimal.format(value);
const strokesLabel = (strokes: number) => `${strokes} ${strokes === 1 ? 'golpe' : 'golpes'}`;
const percent = (value: number, total: number) => total ? `${Math.round((value / total) * 100)} %` : '—';

// Mismas barras y colores que Mis partidas: dobles y triples+ por separado.
const resultRows: Array<{ key: keyof CareerResultDistribution; label: string; color: string }> = [
  { key: 'eagle', label: scoreResultLabel.eagle, color: scoreResultBar.eagle },
  { key: 'birdie', label: scoreResultLabel.birdie, color: scoreResultBar.birdie },
  { key: 'par', label: scoreResultLabel.par, color: scoreResultBar.par },
  { key: 'bogey', label: scoreResultLabel.bogey, color: scoreResultBar.bogey },
  { key: 'double', label: 'Doble bogey', color: scoreResultBar.double },
  { key: 'triplePlus', label: 'Triple o peor', color: 'bg-black ring-1 ring-inset ring-red-500' },
];

const Section: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <section className="rounded-2xl bg-card p-4 shadow-card">
    <h2 className="mb-3 flex items-center gap-2 font-bold text-ink"><Icon size={18} className="text-accent-ink" />{title}</h2>
    {children}
  </section>
);

const MiniStat: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col rounded-xl bg-card-2 p-2.5 text-center">
    <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-ink-3">{label}</p>
    <div className="mt-auto pt-1 font-bold text-title">{children}</div>
  </div>
);

const courseLabel = (course: CareerCoursePerformance) => `${course.courseName} · ${course.numHoles}h`;

export const CareerStatistics: React.FC<CareerStatisticsProps> = ({ account, onBack, onOpenMyRounds, messagesButton }) => {
  const [stats, setStats] = useState<CareerStats | null>(null);
  const [error, setError] = useState('');

  const { userId, nick, displayName } = account;
  useEffect(() => {
    let live = true;
    golfService.getCareerData()
      .then(data => { if (live) setStats(computeCareerStats({ userId, nick, displayName }, data.rounds, data.players, data.scores, data.courseNames, data.holes)); })
      .catch(() => { if (live) setError('No se han podido cargar tus estadísticas. Inténtalo de nuevo.'); });
    return () => { live = false; };
  }, [userId, nick, displayName]);

  const maxResult = stats ? Math.max(1, ...resultRows.map(row => stats.results[row.key])) : 1;
  // F. Solo si se juegan varios formatos con frecuencia: al menos dos modalidades con dos partidas o más.
  const frequentModes = stats ? (Object.keys(modeLabels) as GameMode[]).filter(mode => stats.byMode[mode] >= 2) : [];
  const trend9 = stats?.trend.filter(round => round.numHoles === 9) ?? [];
  const trend18 = stats?.trend.filter(round => round.numHoles === 18) ?? [];

  return (
    <div className="min-h-screen bg-app transition-colors">
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <TopBar className="mb-2" left={<NavigationButton destination="back" onClick={onBack} />} center={messagesButton} />
        <h1 className="text-center text-2xl font-bold text-title">Mis estadísticas acumuladas</h1>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {!stats && !error && <p role="status" className="py-10 text-center text-ink-3">Calculando tus estadísticas…</p>}

        {stats && stats.roundsPlayed === 0 && (
          <div className="rounded-2xl bg-card p-6 text-center shadow-card">
            <BarChart3 size={48} className="mx-auto mb-3 text-ink-4" />
            <p className="font-semibold text-ink">Todavía no hay estadísticas</p>
            <p className="mt-1 text-sm text-ink-3">Termina alguna partida rápida en la que juegues tú para empezar a acumular datos.</p>
          </div>
        )}

        {stats && stats.roundsPlayed > 0 && (
          <>
            {/* A. CABECERO COMPACTO */}
            <section aria-label="Resumen" className="grid grid-cols-2 gap-3">
              {/* Partidas */}
              <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-3.5 md:p-4 text-white shadow-soft border border-emerald-400/30 flex flex-col justify-between">
                <div className="flex items-center justify-center gap-1.5 text-xs md:text-sm font-bold text-white/95 text-center min-w-0">
                  <Calendar size={18} className="shrink-0 opacity-90" />
                  <span className="truncate">Partidas</span>
                </div>
                <div className="mt-2.5 text-center">
                  <p className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none">
                    {stats.roundsPlayed}
                  </p>
                </div>
              </div>

              {/* Golpes por hoyo */}
              <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-3.5 md:p-4 text-white shadow-soft border border-blue-400/30 flex flex-col justify-between">
                <div className="flex items-center justify-center gap-1.5 text-xs md:text-sm font-bold text-white/95 text-center min-w-0">
                  <Activity size={18} className="shrink-0 opacity-90" />
                  <span className="truncate">Golpes por hoyo</span>
                </div>
                <div className="mt-2.5 text-center">
                  <p className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none">
                    {formatNumber(stats.grossPerHole)}
                  </p>
                </div>
              </div>

              {/* Podios */}
              <div className="rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 p-3.5 md:p-4 text-white shadow-soft border border-amber-400/30 flex flex-col justify-between">
                {/* Fila 1: Icono + Texto */}
                <div className="flex items-center justify-center gap-1.5 text-xs md:text-sm font-bold text-white/95 text-center min-w-0">
                  <Trophy size={18} className="shrink-0 opacity-90" />
                  <span className="truncate">Podios</span>
                </div>
                <div className="mt-2 text-center">
                  {/* Fila 2: 1º 2º 3º */}
                  <div className="grid grid-cols-3 gap-1 text-center text-xs font-bold text-amber-100/90">
                    <span>1º</span>
                    <span>2º</span>
                    <span>3º</span>
                  </div>
                  {/* Fila 3: Valores */}
                  <div className="grid grid-cols-3 gap-1 text-center text-xl md:text-2xl font-black text-white mt-0.5">
                    {stats.podiums.slice(0, 3).map((count, index) => (
                      <span key={index}>{count}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stableford medio */}
              <div className="rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 p-3.5 md:p-4 text-white shadow-soft border border-purple-400/30 flex flex-col justify-between">
                {/* Fila 1: Icono + Texto */}
                <div className="flex items-center justify-center gap-1.5 text-xs md:text-sm font-bold text-white/95 text-center min-w-0">
                  <TrendingUp size={18} className="shrink-0 opacity-90" />
                  <span className="truncate">Stableford medio</span>
                </div>
                <div className="mt-2 text-center">
                  {/* Fila 2: 9 hoyos 18 hoyos */}
                  <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold text-purple-100/90">
                    <span>9 hoyos</span>
                    <span>18 hoyos</span>
                  </div>
                  {/* Fila 3: Valores */}
                  <div className="grid grid-cols-2 gap-2 text-center text-xl md:text-2xl font-black text-white mt-0.5">
                    <span>{formatNumber(stats.stableford9.average)}</span>
                    <span>{formatNumber(stats.stableford18.average)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* B. TENDENCIA DE STABLEFORD Y HÁNDICAP */}
            <Section icon={TrendingUp} title="Tendencia de Stableford y hándicap">
              <div className="space-y-5">
                {[{ holes: 9, rounds: trend9, average: stats.stableford9.average }, { holes: 18, rounds: trend18, average: stats.stableford18.average }]
                  .filter(group => group.rounds.length > 0)
                  .map(group => (
                    <div key={group.holes}>
                      <h3 className="mb-1 text-sm font-bold text-ink">Stableford en {group.holes} hoyos <span className="font-semibold text-ink-3">· media {formatNumber(group.average)}</span></h3>
                      <TrendLineChart
                        color="var(--chart-quick)"
                        label="Puntos por partida"
                        reference={group.average}
                        referenceLabel="Tu media"
                        points={group.rounds.map(round => ({
                          key: round.roundId,
                          label: trendDate(round.date),
                          value: round.points,
                          detail: `${shortDate.format(new Date(round.date))} · ${round.courseName}: ${round.points} puntos`,
                        }))}
                      />
                    </div>
                  ))}
                <div>
                  <h3 className="mb-1 text-sm font-bold text-ink">Hándicap de juego <span className="font-semibold text-ink-3">· escala 18 hoyos</span></h3>
                  <TrendLineChart
                    color="var(--chart-group)"
                    label="HCP de juego"
                    fromZero={false}
                    points={stats.trend.map(round => ({
                      key: round.roundId,
                      label: trendDate(round.date),
                      value: round.handicap18,
                      detail: `${shortDate.format(new Date(round.date))} · ${round.courseName} (${round.numHoles}h): HCP ${round.handicap18}`,
                    }))}
                  />
                </div>
              </div>
            </Section>

            {/* D. DISTRIBUCIÓN DE RESULTADOS POR HOYO (ACUMULADO) */}
            <Section icon={Target} title="Resultados por hoyo (neto)">
              <ul className="space-y-2">
                {resultRows.map(row => (
                  <li key={row.key} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 text-sm">
                    <span className="text-ink-2">{row.label}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-card-2">
                      <span className={`block h-full rounded-full ${row.color}`} style={{ width: `${(stats.results[row.key] / maxResult) * 100}%` }} />
                    </span>
                    <span className="text-right font-semibold text-ink">{stats.results[row.key]} <span className="text-xs font-normal text-ink-3">{percent(stats.results[row.key], stats.resultHoles)}</span></span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {/* Birdies por partida */}
                <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-3.5 md:p-4 text-white shadow-soft border border-blue-400/30 flex flex-col justify-between">
                  <div className="flex items-center justify-center gap-1.5 text-xs md:text-sm font-bold text-white/95 text-center min-w-0">
                    <Target size={16} className="shrink-0 opacity-90" />
                    <span className="truncate">Birdies por partida</span>
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">
                      {formatNumber(stats.birdiesPerRound)}
                    </p>
                  </div>
                </div>

                {/* Pares por partida */}
                <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-3.5 md:p-4 text-white shadow-soft border border-emerald-400/30 flex flex-col justify-between">
                  <div className="flex items-center justify-center gap-1.5 text-xs md:text-sm font-bold text-white/95 text-center min-w-0">
                    <Award size={16} className="shrink-0 opacity-90" />
                    <span className="truncate">Pares por partida</span>
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">
                      {formatNumber(stats.parsPerRound)}
                    </p>
                  </div>
                </div>

                {/* Bogeys+ por partida */}
                <div className="rounded-2xl bg-gradient-to-br from-rose-600 to-red-700 p-3.5 md:p-4 text-white shadow-soft border border-rose-400/30 flex flex-col justify-between">
                  <div className="flex items-center justify-center gap-1.5 text-xs md:text-sm font-bold text-white/95 text-center min-w-0">
                    <TrendingUp size={16} className="shrink-0 opacity-90 rotate-180" />
                    <span className="truncate">Bogeys+ por partida</span>
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">
                      {formatNumber(stats.bogeysPlusPerRound)}
                    </p>
                  </div>
                </div>

                {/* Birdies / bogeys+ */}
                <div className="rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 p-3.5 md:p-4 text-white shadow-soft border border-amber-400/30 flex flex-col justify-between">
                  <div className="flex items-center justify-center gap-1.5 text-xs md:text-sm font-bold text-white/95 text-center min-w-0">
                    <Activity size={16} className="shrink-0 opacity-90" />
                    <span className="truncate">Birdies / bogeys+</span>
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">
                      {formatNumber(stats.birdieBogeyRatio)}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-3">El ratio cuenta los birdies o mejor por cada bogey o peor: cuanto más alto, mejor juego.</p>
            </Section>

            {/* E. MOMENTOS */}
            <Section icon={Award} title="Momentos">
              <ul className="divide-y divide-line text-sm">
                {stats.bestRound && (
                  <li className="flex justify-between gap-3 py-2"><span className="text-ink-3">Mejor vuelta</span><span className="text-right"><span className="block font-semibold text-ink">{stats.bestRound.points} pts en {stats.bestRound.holes} hoyos</span><span className="text-xs text-ink-3">{stats.bestRound.courseName} · {shortDate.format(new Date(stats.bestRound.date))}</span></span></li>
                )}
                {stats.worstRound && (
                  <li className="flex justify-between gap-3 py-2"><span className="text-ink-3">Peor vuelta</span><span className="text-right"><span className="block font-semibold text-ink">{stats.worstRound.points} pts en {stats.worstRound.holes} hoyos</span><span className="text-xs text-ink-3">{stats.worstRound.courseName} · {shortDate.format(new Date(stats.worstRound.date))}</span></span></li>
                )}
                {stats.bestHole && (
                  <li className="flex justify-between gap-3 py-2"><span className="text-ink-3">Mejor hoyo</span><span className="text-right"><span className="block font-semibold text-ink">Hoyo {stats.bestHole.holeNumber}: {stats.bestHole.points} pts ({strokesLabel(stats.bestHole.grossStrokes)})</span><span className="text-xs text-ink-3">{stats.bestHole.courseName} · {shortDate.format(new Date(stats.bestHole.date))}</span></span></li>
                )}
                {stats.worstHole && (
                  <li className="flex justify-between gap-3 py-2"><span className="text-ink-3">Peor hoyo</span><span className="text-right"><span className="block font-semibold text-ink">Hoyo {stats.worstHole.holeNumber}: {stats.worstHole.points} pts ({strokesLabel(stats.worstHole.grossStrokes)})</span><span className="text-xs text-ink-3">{stats.worstHole.courseName} · {shortDate.format(new Date(stats.worstHole.date))}</span></span></li>
                )}
              </ul>
            </Section>

            {/* F. PARTIDAS POR MODALIDAD (solo con varios formatos frecuentes) */}
            {frequentModes.length >= 2 && (
              <Section icon={Flag} title="Partidas por modalidad">
                <ul className="space-y-1.5 text-sm">
                  {(Object.keys(modeLabels) as GameMode[]).filter(mode => stats.byMode[mode] > 0).map(mode => (
                    <li key={mode} className="flex justify-between"><span className="text-ink-2">{modeLabels[mode]}</span><span className="font-semibold text-ink">{stats.byMode[mode]}</span></li>
                  ))}
                </ul>
              </Section>
            )}

            {/* C. RENDIMIENTO POR CAMPO */}
            <Section icon={MapPin} title="Rendimiento por campo">
              <div className="mb-3 grid grid-cols-1 gap-2 text-sm">
                {[
                  stats.bestCourse && { label: 'Donde más rindo', value: `${courseLabel(stats.bestCourse)} · media ${formatNumber(stats.bestCourse.average)} pts` },
                  stats.worstCourse && { label: 'Donde menos rindo', value: `${courseLabel(stats.worstCourse)} · media ${formatNumber(stats.worstCourse.average)} pts` },
                  stats.mostPlayedCourse && { label: 'Donde más juego', value: `${stats.mostPlayedCourse.name} · ${stats.mostPlayedCourse.rounds} ${stats.mostPlayedCourse.rounds === 1 ? 'partida' : 'partidas'}` },
                ].filter((item): item is { label: string; value: string } => Boolean(item)).map(item => (
                  <p key={item.label} className="rounded-lg bg-card-2 px-3 py-2">
                    <span className="block text-xs text-ink-3">{item.label}</span>
                    <span className="block font-semibold text-ink">{item.value}</span>
                  </p>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-3">
                      <th className="py-1.5 text-left font-semibold">Campo</th>
                      <th className="px-1 py-1.5 text-center font-semibold">Part.</th>
                      <th className="px-1 py-1.5 text-center font-semibold">Mejor</th>
                      <th className="px-1 py-1.5 text-center font-semibold">Peor</th>
                      <th className="px-1 py-1.5 text-center font-semibold">Media</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.courses.map(course => (
                      <tr key={courseLabel(course)} className="border-b border-line last:border-0">
                        <td className="max-w-[9rem] truncate py-1.5 text-ink">{course.courseName} <span className="text-xs text-ink-3">· {course.numHoles}h</span></td>
                        <td className="px-1 py-1.5 text-center text-ink-2">{course.rounds}</td>
                        <td className="px-1 py-1.5 text-center font-semibold text-ink">{course.best}</td>
                        <td className="px-1 py-1.5 text-center text-ink-2">{course.worst}</td>
                        <td className="px-1 py-1.5 text-center font-semibold text-ink">{formatNumber(course.average)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* G. ÚLTIMAS 3 PARTIDAS (acceso rápido a Mis partidas) */}
            <Section icon={Trophy} title="Últimas partidas">
              <ul className="divide-y divide-line text-sm">
                {stats.recent.slice(0, 3).map(round => (
                  <li key={round.roundId}>
                    <button type="button" onClick={() => onOpenMyRounds?.(round.roundId)} disabled={!onOpenMyRounds}
                      className="flex w-full items-center justify-between gap-3 py-2 text-left enabled:hover:bg-card-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{round.courseName}</span>
                        <span className="text-xs text-ink-3">{shortDate.format(new Date(round.date))} · {modeLabels[round.mode]}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-right">
                        <span>
                          <span className="block font-semibold text-ink">{round.points} pts</span>
                          <span className={`text-xs font-semibold ${round.position === 1 ? 'text-yellow-800 dark:text-yellow-300' : 'text-ink-3'}`}>{round.position > 0 ? `${round.position}.º de ${round.totalPlayers}` : '—'}</span>
                        </span>
                        {onOpenMyRounds && <ChevronRight size={16} className="text-ink-4" aria-hidden="true" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {onOpenMyRounds && (
                <button type="button" onClick={() => onOpenMyRounds()} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-card-2 px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-soft">
                  Ver todas en Mis partidas <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </Section>
          </>
        )}

        {stats && stats.roundsUnidentified > 0 && (
          <p className="text-center text-xs text-ink-4">
            {stats.roundsUnidentified === 1 ? 'Hay 1 partida' : `Hay ${stats.roundsUnidentified} partidas`} tuyas en las que no aparece ningún jugador con tu nick o tu nombre, y no se cuentan.
          </p>
        )}
      </main>
    </div>
  );
};
