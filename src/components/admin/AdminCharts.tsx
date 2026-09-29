import { useState, type ReactNode } from 'react';
import { weekLabel } from './adminFormat';

export function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-card border border-line rounded-2xl p-4 space-y-3 min-w-0 ${className}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {note && <span className="text-xs text-ink-3">{note}</span>}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="bg-card border border-line rounded-2xl p-4 grid gap-1 content-start">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="text-2xl font-bold tabular-nums leading-tight">{value}</span>
      {detail && <span className="text-xs text-ink-3">{detail}</span>}
    </div>
  );
}

export function BarList({ rows, empty = 'Sin datos en este periodo.', format = (v: number) => String(v) }: {
  rows: { label: string; value: number }[]; empty?: string; format?: (value: number) => string;
}) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length || rows.every(r => r.value === 0)) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="grid gap-2.5">
      {rows.map(r => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm" title={`${r.label}: ${format(r.value)}`}>
          <span className="truncate">{r.label}</span>
          <span className="tabular-nums text-ink-2">{format(r.value)}</span>
          <span className="col-span-2 h-2 rounded bg-card-2 overflow-hidden">
            <span className="block h-full rounded bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Stacked weekly bars on one scale; the hovered week is described below the chart. */
export function WeeklyRounds({ weeks }: { weeks: { week: string; quick: number; group: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 560, H = 210, L = 30, R = 6, T = 14, B = 180;
  const peak = Math.max(0, ...weeks.map(w => w.quick + w.group));
  const step = peak <= 4 ? 1 : peak <= 20 ? 5 : peak <= 60 ? 10 : Math.ceil(peak / 50) * 10;
  const max = Math.max(step, Math.ceil(peak / step) * step);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step).filter((_, i, all) => all.length <= 6 || i % 2 === 0);
  const y = (v: number) => B - (v / max) * (B - T);
  const slot = (W - L - R) / Math.max(1, weeks.length), bar = slot * 0.62;
  const shown = active ?? weeks.length - 1;
  const current = weeks[shown];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--chart-group)' }} />De grupo</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--chart-quick)' }} />Rápidas</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Partidas jugadas por semana en las últimas ${weeks.length} semanas`} onMouseLeave={() => setActive(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{t}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = L + i * slot + (slot - bar) / 2, total = w.quick + w.group;
          return (
            <g key={w.week} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} tabIndex={0} aria-label={`Semana del ${weekLabel(w.week)}: ${w.group} de grupo, ${w.quick} rápidas`}>
              <rect x={L + i * slot} y={T} width={slot} height={B - T} fill="transparent" />
              {active === i && <rect x={L + i * slot} y={T} width={slot} height={B - T} fill="var(--card-2)" />}
              {w.quick > 0 && <rect x={x} y={y(w.quick)} width={bar} height={B - y(w.quick)} rx={2} fill="var(--chart-quick)" />}
              {w.group > 0 && <rect x={x} y={y(total)} width={bar} height={Math.max(0, y(w.quick) - y(total) - (w.quick > 0 ? 2 : 0))} rx={3} fill="var(--chart-group)" />}
              {i % 2 === (weeks.length - 1) % 2 && <text x={x + bar / 2} y={B + 18} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{weekLabel(w.week)}</text>}
            </g>
          );
        })}
      </svg>
      {current && (
        <p className="text-sm text-ink-2 tabular-nums" aria-live="polite">
          Semana del {weekLabel(current.week)}: <b>{current.group + current.quick}</b> partidas · {current.group} de grupo · {current.quick} rápidas
        </p>
      )}
    </div>
  );
}

/** One cell per week; darker cells mean more rounds that week. */
export function WeekStrip({ weeks }: { weeks: { week: string; count: number }[] }) {
  const level = (n: number) => n === 0 ? 'var(--card-2)'
    : `color-mix(in oklab, var(--accent) ${n === 1 ? 35 : n === 2 ? 65 : 100}%, var(--card-2))`;
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map(w => (
          <span key={w.week} title={`Semana del ${weekLabel(w.week)}: ${w.count} partidas`} className="aspect-square rounded-[3px]" style={{ background: level(w.count) }} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-3 mt-1.5">
        <span>{weeks[0] && weekLabel(weeks[0].week)}</span><span>Esta semana</span>
      </div>
    </div>
  );
}
