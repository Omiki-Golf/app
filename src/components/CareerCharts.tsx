import { useState } from 'react';

// Tendencias de Mis estadísticas acumuladas: una línea por gráfica, partida a partida, en SVG propio.
// Colores de la app validados para daltonismo: --chart-quick (puntos) y --chart-group (hándicap).

export interface TrendPoint {
  key: string;
  /** Etiqueta corta del eje (fecha). */
  label: string;
  value: number;
  /** Detalle que se muestra al tocar el punto. */
  detail: string;
}

const W = 340;
const L = 30;
const R = 12;
const H = 150;
const T = 10;
const B = 118;

/** Línea de tendencia con una referencia discontinua opcional (la media). */
export function TrendLineChart({ points, color, label, reference, referenceLabel, fromZero = true }: {
  points: TrendPoint[];
  color: string;
  label: string;
  reference?: number | null;
  referenceLabel?: string;
  fromZero?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return null;
  const values = points.map((point) => point.value).concat(reference ?? []);
  const low = fromZero ? 0 : Math.floor(Math.min(...values) - 1);
  const high = Math.ceil(Math.max(...values) + (fromZero ? 0 : 1));
  const span = Math.max(1, high - low);
  const step = span <= 6 ? 1 : span <= 12 ? 2 : span <= 30 ? 5 : 10;
  const min = Math.floor(low / step) * step;
  const max = Math.max(min + step, Math.ceil(high / step) * step);
  const y = (value: number) => B - ((value - min) / (max - min)) * (B - T);
  const x = (index: number) => points.length === 1 ? (L + W - R) / 2 : L + (index * (W - L - R)) / (points.length - 1);
  const ticks = Array.from({ length: (max - min) / step + 1 }, (_, index) => min + index * step);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join('');
  const slot = points.length <= 1 ? W - L - R : (W - L - R) / (points.length - 1);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const shown = points[active ?? points.length - 1];

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true"><line x1="1" x2="17" y1="4" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
          {label}
        </span>
        {reference !== undefined && reference !== null && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true"><line x1="1" x2="17" y1="4" y2="4" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
            {referenceLabel}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" onMouseLeave={() => setActive(null)}
        aria-label={`${label}: ${points.length} partidas, la última ${points[points.length - 1].value}.`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke="var(--line)" />
            <text x={L - 6} y={y(tick) + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)">{tick}</text>
          </g>
        ))}
        {reference !== undefined && reference !== null && (
          <line x1={L} x2={W - R} y1={y(reference)} y2={y(reference)} stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 4" />
        )}
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => (
          <g key={point.key} tabIndex={0} aria-label={point.detail}
            onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)}>
            <rect x={x(index) - slot / 2} y={T} width={slot} height={B - T} fill="transparent" />
            {active === index && <line x1={x(index)} x2={x(index)} y1={T} y2={B} stroke="var(--ink-3)" strokeDasharray="2 3" />}
            <circle cx={x(index)} cy={y(point.value)} r="4" fill={color} stroke="var(--card)" strokeWidth="2"><title>{point.detail}</title></circle>
            {(index % labelEvery === 0 || index === points.length - 1) && (
              <text x={x(index)} y={B + 16} textAnchor="middle" fontSize="10" fill="var(--ink-3)">{point.label}</text>
            )}
          </g>
        ))}
      </svg>
      <p className="mt-1 text-xs text-ink-2" aria-live="polite">{shown.detail}</p>
    </div>
  );
}
