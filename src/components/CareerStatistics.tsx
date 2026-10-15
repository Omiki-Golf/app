import React, { useEffect, useState } from 'react';
import { Award, BarChart3, Flag, MapPin, Target, Trophy } from 'lucide-react';
import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import { golfService } from '../services/golfService';
import { computeCareerStats, type CareerAccount, type CareerStats } from '../utils/careerStats';
import type { GameMode } from '../types';

interface CareerStatisticsProps {
  account: CareerAccount;
  onBack: () => void;
  messagesButton?: React.ReactNode;
}

const modeLabels: Record<GameMode, string> = {
  stableford: 'Stableford',
  match: 'Match Play',
  sindicato: 'Sindicato',
  parejas: 'Parejas',
};
const shortDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

const Tile: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-line bg-card p-4 text-center shadow-soft">
    <p className="text-2xl font-bold text-title">{value}</p>
    <p className="text-xs font-semibold text-ink-2">{label}</p>
    {hint && <p className="mt-0.5 text-[11px] text-ink-4">{hint}</p>}
  </div>
);

const Section: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <section className="rounded-2xl bg-card p-5 shadow-card">
    <h2 className="mb-3 flex items-center gap-2 font-bold text-ink"><Icon size={18} className="text-accent-ink" />{title}</h2>
    {children}
  </section>
);

export const CareerStatistics: React.FC<CareerStatisticsProps> = ({ account, onBack, messagesButton }) => {
  const [stats, setStats] = useState<CareerStats | null>(null);
  const [error, setError] = useState('');

  const { userId, nick, displayName } = account;
  useEffect(() => {
    let live = true;
    golfService.getCareerData(userId)
      .then(data => { if (live) setStats(computeCareerStats({ userId, nick, displayName }, data.rounds, data.players, data.scores, data.courseNames)); })
      .catch(() => { if (live) setError('No se han podido cargar tus estadísticas. Inténtalo de nuevo.'); });
    return () => { live = false; };
  }, [userId, nick, displayName]);

  const distribution = stats ? [
    { label: 'Eagle o mejor', value: stats.distribution.eagleOrBetter, color: 'bg-yellow-500' },
    { label: 'Birdie', value: stats.distribution.birdie, color: 'bg-red-500' },
    { label: 'Par', value: stats.distribution.par, color: 'bg-emerald-500' },
    { label: 'Bogey', value: stats.distribution.bogey, color: 'bg-blue-500' },
    { label: 'Doble o peor', value: stats.distribution.doubleOrWorse, color: 'bg-ink-4' },
  ] : [];
  const maxBar = Math.max(1, ...distribution.map(item => item.value));

  return (
    <div className="min-h-screen bg-app transition-colors">
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <TopBar className="mb-2" left={<NavigationButton destination="back" onClick={onBack} />} center={messagesButton} />
        <h1 className="text-center text-2xl font-bold text-title">Mis estadísticas</h1>

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
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Partidas" value={String(stats.roundsPlayed)} hint={`${stats.holesPlayed} hoyos`} />
              <Tile label="Victorias" value={String(stats.wins)} hint={`${Math.round((stats.wins / stats.roundsPlayed) * 100)} % de las partidas`} />
              <Tile label="Stableford medio" value={stats.stablefordPer18 === null ? '—' : decimal.format(stats.stablefordPer18)} hint="puntos por 18 hoyos" />
              <Tile label="Golpes por hoyo" value={stats.grossPerHole === null ? '—' : decimal.format(stats.grossPerHole)} hint="media en bruto" />
            </div>

            {stats.bestRound && (
              <Section icon={Trophy} title="Mejor partida">
                <p className="text-3xl font-bold text-title">{stats.bestRound.points} <span className="text-base font-semibold text-ink-3">puntos en {stats.bestRound.holes} hoyos</span></p>
                <p className="mt-1 text-sm text-ink-3">{stats.bestRound.courseName} · {shortDate.format(new Date(stats.bestRound.date))} · {modeLabels[stats.bestRound.mode]}</p>
              </Section>
            )}

            <Section icon={Target} title="Resultados por hoyo (neto)">
              <ul className="space-y-2">
                {distribution.map(item => (
                  <li key={item.label} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                    <span className="text-ink-2">{item.label}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-card-2">
                      <span className={`block h-full rounded-full ${item.color}`} style={{ width: `${(item.value / maxBar) * 100}%` }} />
                    </span>
                    <span className="text-right font-semibold text-ink">{item.value}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section icon={Award} title="Momentos">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xl font-bold text-title">{stats.holeInOnes}</p><p className="text-xs text-ink-3">Hoyos en uno</p></div>
                <div><p className="text-xl font-bold text-title">{stats.spanishHands}</p><p className="text-xs text-ink-3">Spanish Hands</p></div>
                <div><p className="text-xl font-bold text-title">{stats.noPasoRojas}</p><p className="text-xs text-ink-3">No pasó de rojas</p></div>
              </div>
            </Section>

            <Section icon={Flag} title="Por modalidad">
              <ul className="space-y-1.5 text-sm">
                {(Object.keys(modeLabels) as GameMode[]).filter(mode => stats.byMode[mode] > 0).map(mode => (
                  <li key={mode} className="flex justify-between"><span className="text-ink-2">{modeLabels[mode]}</span><span className="font-semibold text-ink">{stats.byMode[mode]}</span></li>
                ))}
              </ul>
            </Section>

            <Section icon={MapPin} title="Campos más jugados">
              <ul className="space-y-1.5 text-sm">
                {stats.topCourses.map(course => (
                  <li key={course.name} className="flex justify-between gap-3"><span className="min-w-0 truncate text-ink-2">{course.name}</span><span className="shrink-0 font-semibold text-ink">{course.rounds}</span></li>
                ))}
              </ul>
            </Section>

            <Section icon={BarChart3} title="Últimas partidas">
              <ul className="divide-y divide-line text-sm">
                {stats.recent.map(round => (
                  <li key={round.roundId} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{round.courseName}</span>
                      <span className="text-xs text-ink-3">{shortDate.format(new Date(round.date))} · {modeLabels[round.mode]}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold text-ink">{round.points} pts</span>
                      {round.won && <span className="text-xs font-semibold text-yellow-600">Ganada</span>}
                    </span>
                  </li>
                ))}
              </ul>
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
