import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { adminService, type AttentionSegment, type MetricsOverview, type MetricsPeriod, type SegmentRow } from '../../services/adminService';
import { BarList, Panel, Stat, WeeklyRounds } from './AdminCharts';
import { modeLabels, planLabels, shortDate, sinceLabel } from './adminFormat';

const periods: { value: MetricsPeriod; label: string }[] = [
  { value: 7, label: '7 días' }, { value: 30, label: '30 días' }, { value: 90, label: '90 días' }, { value: 365, label: '12 meses' },
];
const percent = (part: number, total: number) => total ? `${Math.round((part / total) * 100)}%` : '—';
const errorText = (e: unknown) => e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se han podido cargar las métricas.';

/** What each person in a list shows, so the reason they appear is visible at a glance. */
function segmentDetail(segment: AttentionSegment, row: SegmentRow) {
  if (segment === 'inactive_60') return `Última partida: ${shortDate(row.last_round_at)} (${sinceLabel(row.last_round_at).toLowerCase()})`;
  if (segment === 'never_played') return `Registro: ${shortDate(row.created_at)} · último inicio de sesión: ${sinceLabel(row.last_sign_in_at).toLowerCase()}`;
  if (segment === 'expiring_7') return `${planLabels[row.plan ?? 'express']} · caduca el ${shortDate(row.current_period_end)}`;
  return `Grupo ${row.group_name || row.group_code} · invitado por ${row.invited_by_nick || '—'} el ${shortDate(row.created_at)}`;
}

function SegmentList({ segment, refreshKey, onOpenUser }: { segment: AttentionSegment; refreshKey: unknown; onOpenUser: (id: string) => void }) {
  const [result, setResult] = useState<{ total: number; rows: SegmentRow[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setResult(null); setError('');
    adminService.segment(segment).then(r => current && setResult(r)).catch(e => current && setError(errorText(e)));
    return () => { current = false; };
  }, [segment, refreshKey]);
  if (error) return <p role="alert" className="text-red-600 text-sm py-2">{error}</p>;
  if (!result) return <p role="status" className="text-ink-3 text-sm py-2 pl-5">Cargando…</p>;
  return (
    <div className="mt-1 mb-2 ml-5 border-l-2 border-line pl-3 space-y-1">
      <ul className="grid">
        {result.rows.map(row => (
          <li key={`${row.user_id}-${row.group_id ?? ''}`}>
            <button type="button" onClick={() => onOpenUser(row.user_id)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-card-2 grid">
              <span className="font-semibold truncate">{row.nick || 'Registro pendiente'} <span className="font-normal text-ink-3 break-all">· {row.email || 'sin correo'}</span></span>
              <span className="text-xs text-ink-3">{segmentDetail(segment, row)}</span>
            </button>
          </li>
        ))}
      </ul>
      {result.total > result.rows.length && <p className="text-xs text-ink-3 px-2">Se muestran {result.rows.length} de {result.total}.</p>}
    </div>
  );
}

export function AdminOverview({ onOpen, onOpenUser }: { onOpen: (tab: 'users' | 'groups') => void; onOpenUser: (id: string) => void }) {
  const [days, setDays] = useState<MetricsPeriod>(30);
  const [open, setOpen] = useState<AttentionSegment | null>(null);
  const [data, setData] = useState<MetricsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);

  const load = useCallback(async () => {
    const id = ++version.current;
    setLoading(true); setError('');
    try {
      const next = await adminService.overview(days);
      if (id === version.current) setData(next);
    } catch (e) {
      if (id === version.current) setError(errorText(e));
    } finally {
      if (id === version.current) setLoading(false);
    }
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const period = days === 365 ? 'los últimos 12 meses' : `los últimos ${days} días`;
  const paid = data ? data.users.plans.player + data.users.plans.team : 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-card overflow-hidden" role="group" aria-label="Periodo">
          {periods.map(p => (
            <button key={p.value} type="button" aria-pressed={days === p.value} onClick={() => setDays(p.value)}
              className={`px-3 py-2 text-sm ${days === p.value ? 'bg-accent text-on-accent font-semibold' : 'text-ink-2 hover:bg-card-2'}`}>{p.label}</button>
          ))}
        </div>
        <button type="button" disabled={loading} onClick={() => void load()} className="flex items-center gap-2 text-sm border border-line bg-card rounded-xl px-3 py-2 disabled:opacity-50">
          <RefreshCw size={16} aria-hidden="true" />Actualizar métricas
        </button>
      </div>

      {error && <p role="alert" className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">{error}</p>}
      {loading && !data && <Loader2 className="animate-spin mx-auto my-10" aria-label="Cargando" />}

      {data && (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Jugadores con partida" value={data.users.with_round} detail={`${data.users.signed_in} iniciaron sesión en ${period}`} />
            <Stat label="Partidas jugadas" value={data.rounds.played} detail={`${data.rounds.group} de grupo · ${data.rounds.quick} rápidas · ${data.rounds.in_progress} en juego ahora`} />
            <Stat label="Nuevos registros" value={data.users.new} detail={`${data.users.total} jugadores registrados en total`} />
            <Stat label="En plan de pago" value={percent(paid, data.users.total)} detail={`${paid} jugadores hoy`} />
          </div>

          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-3">
            <Panel title="Partidas por semana" note="últimas 12 semanas">
              <WeeklyRounds weeks={data.weekly} />
            </Panel>
            <Panel title="Modalidades" note={`% de partidas en ${period}`}>
              <BarList rows={data.modes.map(m => ({ label: modeLabels[m.mode] ?? m.mode, value: m.count }))}
                format={v => percent(v, data.rounds.played)} />
              {data.rounds.played > 0 && <p className="text-xs text-ink-3">{percent(data.rounds.nine_holes, data.rounds.played)} de las partidas fueron a 9 hoyos.</p>}
            </Panel>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Panel title="Campos más jugados" note="partidas">
              <BarList rows={data.courses.map(c => ({ label: c.course, value: c.count }))} />
            </Panel>
            <Panel title="Frecuencia de juego" note="jugadores, últimos 90 días">
              <BarList empty="Ningún jugador vinculado ha jugado en los últimos 90 días." rows={[
                { label: 'Semanal o más', value: data.frequency.weekly },
                { label: '2 o 3 al mes', value: data.frequency.few_per_month },
                { label: 'Alrededor de 1 al mes', value: data.frequency.monthly },
                { label: 'Ocasional (1 o 2)', value: data.frequency.occasional },
              ]} />
            </Panel>
            <Panel title="Jugadores por plan" note="hoy">
              <BarList rows={(['express', 'player', 'team'] as const).map(p => ({ label: planLabels[p], value: data.users.plans[p] }))} />
            </Panel>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Panel title="Grupos e invitaciones" note={period}>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm [&>dt]:text-ink-3 [&>dd]:text-right [&>dd]:font-semibold [&>dd]:tabular-nums">
                <dt>Grupos con alguna partida</dt><dd>{data.groups.active} de {data.groups.total}</dd>
                <dt>Grupos creados</dt><dd>{data.groups.new}</dd>
                <dt>Miembros por grupo (media)</dt><dd>{data.groups.avg_members?.toLocaleString('es-ES') ?? '—'}</dd>
                <dt>Invitaciones enviadas</dt><dd>{data.invitations.sent}</dd>
                <dt>Invitaciones aceptadas</dt><dd>{data.invitations.accepted} ({percent(data.invitations.accepted, data.invitations.sent)})</dd>
              </dl>
              <button type="button" onClick={() => onOpen('groups')} className="text-sm text-accent-ink font-semibold">Ver grupos</button>
            </Panel>
            <Panel title="Requieren atención" note="hoy">
              <ul className="grid gap-1 text-sm">
                {([
                  ['inactive_60', 'Sin jugar desde hace más de 60 días', data.attention.inactive_60],
                  ['never_played', 'Registrados hace más de 7 días sin ninguna partida', data.attention.never_played],
                  ['expiring_7', 'Plan de pago que caduca en 7 días', data.attention.expiring_7],
                  ['stale_invitations', 'Invitaciones a grupo pendientes desde hace más de 14 días', data.invitations.pending_stale],
                ] as const).map(([segment, label, value]) => (
                  <li key={segment}>
                    <button type="button" disabled={value === 0} aria-expanded={value > 0 ? open === segment : undefined}
                      onClick={() => setOpen(open === segment ? null : segment)}
                      className="w-full flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 text-left enabled:hover:bg-card-2 disabled:cursor-default">
                      <span className="flex items-center gap-1.5">
                        {value > 0 && <ChevronRight size={14} aria-hidden="true" className={`shrink-0 transition-transform ${open === segment ? 'rotate-90' : ''}`} />}
                        {label}
                      </span>
                      <span className={`tabular-nums font-semibold rounded-full px-2 py-0.5 text-xs ${value > 0 ? 'bg-amber-100 text-amber-800' : 'bg-card-2 text-ink-3'}`}>{value}</span>
                    </button>
                    {open === segment && <SegmentList segment={segment} refreshKey={data} onOpenUser={onOpenUser} />}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <p className="text-xs text-ink-3 max-w-prose">
            Se cuentan como jugadas las partidas finalizadas o archivadas que no se han retirado. Las cifras por jugador solo incluyen partidas en las que figura con su cuenta, normalmente a través de un grupo. Los jugadores de partidas rápidas sin cuenta vinculada no se atribuyen a nadie.
          </p>
        </div>
      )}
    </section>
  );
}
