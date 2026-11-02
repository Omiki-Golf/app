import { useState } from 'react';
import type { MyRoundEvolutionPoint } from '../utils/myRoundStats';

// Gráficas de evolución de Mis partidas, en SVG propio como las del panel de administración.
// Colores: --chart-quick (verde) y --chart-group (índigo), la pareja validada para daltonismo en ambos temas.
// Un solo eje Y por gráfica: golpes y puntos van en dos gráficas apiladas que comparten los hoyos.

const W = 340;
const L = 28;
const R = 30;

const xOf = (index: number, count: number) => L + (count <= 1 ? 0 : (index * (W - L - R)) / (count - 1));

/** Trazo que se corta en los hoyos no jugados. */
const linePath = (points: Array<{ x: number; y: number; played: boolean }>) =>
  points.reduce((path, point, index) => {
    if (!point.played) return path;
    const previous = points[index - 1];
    return `${path}${previous?.played ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }, '');

const Legend = ({ items }: { items: Array<{ label: string; color: string; dashed?: boolean }> }) => (
  <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--ink-2)' }}>
    {items.map((item) => (
      <span key={item.label} className="inline-flex items-center gap-1.5">
        <svg width="18" height="8" aria-hidden="true">
          <line x1="1" x2="17" y1="4" y2="4" stroke={item.color} strokeWidth="2" strokeDasharray={item.dashed ? '3 3' : undefined} strokeLinecap="round" />
        </svg>
        {item.label}
      </span>
    ))}
  </div>
);

/** Columnas invisibles para tocar o pasar el ratón por cada hoyo. */
const HoleTargets = ({ count, top, bottom, active, onActive, describe }: {
  count: number; top: number; bottom: number; active: number | null;
  onActive: (index: number | null) => void; describe: (index: number) => string;
}) => {
  const slot = count <= 1 ? W - L - R : (W - L - R) / (count - 1);
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <g key={index} tabIndex={0} aria-label={describe(index)}
          onMouseEnter={() => onActive(index)} onFocus={() => onActive(index)} onClick={() => onActive(index)}>
          {active === index && <line x1={xOf(index, count)} x2={xOf(index, count)} y1={top} y2={bottom} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 3" />}
          <rect x={xOf(index, count) - slot / 2} y={top} width={slot} height={bottom - top} fill="transparent" />
        </g>
      ))}
    </>
  );
};

const HoleAxis = ({ evolution, y }: { evolution: MyRoundEvolutionPoint[]; y: number }) => (
  <>
    {evolution.map((point, index) => (
      (evolution.length <= 9 || index % 2 === 0 || index === evolution.length - 1) && (
        <text key={point.holeNumber} x={xOf(index, evolution.length)} y={y} textAnchor="middle" fontSize="10" fill="var(--ink-3)">{point.holeNumber}</text>
      )
    ))}
  </>
);

const Marker = ({ x, y, color, title }: { x: number; y: number; color: string; title: string }) => (
  <circle cx={x} cy={y} r="4" fill={color} stroke="var(--card)" strokeWidth="2">
    <title>{title}</title>
  </circle>
);

/** Propuesta A: puntos acumulados frente a jugar a tu hándicap (2 puntos por hoyo). */
export function CumulativePointsChart({ evolution }: { evolution: MyRoundEvolutionPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const count = evolution.length;
  if (count === 0) return null;
  const H = 190, T = 10, B = 160;
  const step = count <= 9 ? 6 : 12;
  const peak = Math.max(2 * count, ...evolution.map((point) => point.cumulativePoints));
  const max = Math.ceil(peak / step) * step;
  const y = (value: number) => B - (value / max) * (B - T);
  const ticks = Array.from({ length: max / step + 1 }, (_, index) => index * step);
  const mine = evolution.map((point, index) => ({ x: xOf(index, count), y: y(point.cumulativePoints), played: point.played }));
  const handicap = evolution.map((point, index) => ({ x: xOf(index, count), y: y(point.handicapLine), played: true }));
  const last = evolution[count - 1];
  const difference = last.cumulativePoints - last.handicapLine;
  const shown = evolution[active ?? count - 1];

  return (
    <div>
      <Legend items={[{ label: 'Mis puntos', color: 'var(--chart-quick)' }, { label: 'A tu hándicap (2 por hoyo)', color: 'var(--ink-3)', dashed: true }]} />
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" onMouseLeave={() => setActive(null)}
        aria-label={`Puntos acumulados: ${last.cumulativePoints} frente a ${last.handicapLine} jugando a tu hándicap (${difference >= 0 ? '+' : ''}${difference}).`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke="var(--line)" />
            <text x={L - 6} y={y(tick) + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)">{tick}</text>
          </g>
        ))}
        {/* Zona entre las dos líneas: verde por encima de tu hándicap, roja por debajo. */}
        {evolution.slice(1).map((point, index) => {
          const previous = evolution[index];
          if (!point.played || !previous.played) return null;
          const ahead = point.cumulativePoints - point.handicapLine >= 0;
          const x1 = xOf(index, count), x2 = xOf(index + 1, count);
          return (
            <polygon key={point.holeNumber} fill={ahead ? 'var(--chart-quick)' : '#dc2626'} opacity="0.14"
              points={`${x1},${y(previous.cumulativePoints)} ${x2},${y(point.cumulativePoints)} ${x2},${y(point.handicapLine)} ${x1},${y(previous.handicapLine)}`} />
          );
        })}
        <path d={linePath(handicap)} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={linePath(mine)} fill="none" stroke="var(--chart-quick)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <HoleTargets count={count} top={T} bottom={B} active={active} onActive={setActive}
          describe={(index) => `Hoyo ${evolution[index].holeNumber}: ${evolution[index].cumulativePoints} puntos acumulados, ${evolution[index].handicapLine} a tu hándicap`} />
        {evolution.map((point, index) => point.played && (
          <Marker key={point.holeNumber} x={mine[index].x} y={mine[index].y} color="var(--chart-quick)"
            title={`Hoyo ${point.holeNumber}: ${point.cumulativePoints} acumulados (${point.points} en el hoyo)`} />
        ))}
        <text x={W - R + 6} y={y(last.cumulativePoints) + 4} fontSize="11" fontWeight="700" fill="var(--ink)">{last.cumulativePoints}</text>
        <text x={W - R + 6} y={y(last.handicapLine) + 4} fontSize="11" fill="var(--ink-3)">{last.handicapLine}</text>
        <HoleAxis evolution={evolution} y={B + 16} />
        <text x={(L + W - R) / 2} y={H - 2} textAnchor="middle" fontSize="10" fill="var(--ink-3)">Hoyo</text>
      </svg>
      <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }} aria-live="polite">
        Hoyo {shown.holeNumber}: <strong style={{ color: 'var(--ink)' }}>{shown.cumulativePoints} puntos</strong> acumulados frente a {shown.handicapLine} a tu hándicap
        {' '}({shown.cumulativePoints - shown.handicapLine >= 0 ? '+' : ''}{shown.cumulativePoints - shown.handicapLine}).
      </p>
    </div>
  );
}

/** Propuesta B: golpes por hoyo y puntos por hoyo, en dos gráficas apiladas con los mismos hoyos. */
export function StrokesPointsChart({ evolution }: { evolution: MyRoundEvolutionPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const count = evolution.length;
  if (count === 0) return null;
  const played = evolution.filter((point) => point.played);
  const strokesMin = Math.max(1, Math.min(...evolution.map((point) => point.par), ...played.map((point) => point.grossStrokes)) - 1);
  const strokesMax = Math.max(...evolution.map((point) => point.par), ...played.map((point) => point.grossStrokes)) + 1;
  const pointsMax = Math.max(4, ...played.map((point) => point.points));

  // Dos paneles dentro del mismo SVG: golpes arriba, puntos abajo; el eje de hoyos va al final.
  const H = 250;
  const top = { T: 14, B: 106 };
  const bottom = { T: 140, B: 220 };
  const yStrokes = (value: number) => top.B - ((value - strokesMin) / (strokesMax - strokesMin)) * (top.B - top.T);
  const yPoints = (value: number) => bottom.B - (value / pointsMax) * (bottom.B - bottom.T);
  const strokesTicks = Array.from({ length: strokesMax - strokesMin + 1 }, (_, index) => strokesMin + index).filter((value, _, all) => all.length <= 6 || value % 2 === 0);
  const pointsTicks = Array.from({ length: pointsMax + 1 }, (_, index) => index);
  const strokes = evolution.map((point, index) => ({ x: xOf(index, count), y: yStrokes(point.grossStrokes), played: point.played }));
  const points = evolution.map((point, index) => ({ x: xOf(index, count), y: yPoints(point.points), played: point.played }));
  const pars = evolution.map((point, index) => ({ x: xOf(index, count), y: yStrokes(point.par), played: true }));
  const shown = evolution[active ?? count - 1];

  return (
    <div>
      <Legend items={[
        { label: 'Golpes', color: 'var(--chart-group)' },
        { label: 'Par del hoyo', color: 'var(--ink-3)', dashed: true },
        { label: 'Puntos', color: 'var(--chart-quick)' },
      ]} />
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" onMouseLeave={() => setActive(null)}
        aria-label={`Golpes y puntos por hoyo en ${count} hoyos.`}>
        <text x={L} y={top.T - 4} fontSize="10" fontWeight="700" fill="var(--ink-2)">Golpes</text>
        {strokesTicks.map((tick) => (
          <g key={`s${tick}`}>
            <line x1={L} x2={W - R} y1={yStrokes(tick)} y2={yStrokes(tick)} stroke="var(--line)" />
            <text x={L - 6} y={yStrokes(tick) + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)">{tick}</text>
          </g>
        ))}
        <path d={linePath(pars)} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={linePath(strokes)} fill="none" stroke="var(--chart-group)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        <text x={L} y={bottom.T - 6} fontSize="10" fontWeight="700" fill="var(--ink-2)">Puntos</text>
        {pointsTicks.map((tick) => (
          <g key={`p${tick}`}>
            <line x1={L} x2={W - R} y1={yPoints(tick)} y2={yPoints(tick)} stroke="var(--line)" strokeDasharray={tick === 2 ? '4 4' : undefined} />
            <text x={L - 6} y={yPoints(tick) + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)">{tick}</text>
          </g>
        ))}
        <path d={linePath(points)} fill="none" stroke="var(--chart-quick)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        <HoleTargets count={count} top={top.T} bottom={bottom.B} active={active} onActive={setActive}
          describe={(index) => `Hoyo ${evolution[index].holeNumber}, par ${evolution[index].par}: ${evolution[index].grossStrokes} golpes, ${evolution[index].points} puntos`} />
        {evolution.map((point, index) => point.played && (
          <g key={point.holeNumber}>
            <Marker x={strokes[index].x} y={strokes[index].y} color="var(--chart-group)" title={`Hoyo ${point.holeNumber} (par ${point.par}): ${point.grossStrokes} golpes`} />
            <Marker x={points[index].x} y={points[index].y} color="var(--chart-quick)" title={`Hoyo ${point.holeNumber}: ${point.points} puntos`} />
          </g>
        ))}
        <HoleAxis evolution={evolution} y={bottom.B + 16} />
        <text x={(L + W - R) / 2} y={H - 2} textAnchor="middle" fontSize="10" fill="var(--ink-3)">Hoyo</text>
      </svg>
      <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }} aria-live="polite">
        Hoyo {shown.holeNumber} (par {shown.par}): <strong style={{ color: 'var(--ink)' }}>{shown.played ? `${shown.grossStrokes} golpes · ${shown.points} puntos` : 'sin jugar'}</strong>
      </p>
    </div>
  );
}
