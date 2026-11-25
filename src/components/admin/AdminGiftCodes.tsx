import { useCallback, useEffect, useState } from 'react';
import { Copy, Gift, Loader2, RefreshCw } from 'lucide-react';
import {
  GIFT_DURATIONS, GIFT_PLAN_NAMES, giftCodeLabel, giftCodeService,
  type GiftCodeRow, type GiftCodeStatus, type GiftDuration, type GiftPlan,
} from '../../services/giftCodeService';

const STATUS: Record<GiftCodeStatus, { label: string; classes: string }> = {
  available: { label: 'Disponible', classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  redeemed: { label: 'Canjeado', classes: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  expired: { label: 'Caducado', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  revoked: { label: 'Anulado', classes: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
};
const date = (value: string) => new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
const inOneMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); };
const field = 'w-full rounded-xl border border-line-2 bg-card px-3 py-2.5 text-sm text-ink';

export function AdminGiftCodes() {
  const [plan, setPlan] = useState<GiftPlan>('player');
  const [duration, setDuration] = useState<GiftDuration>('annual');
  const [count, setCount] = useState('1');
  const [expires, setExpires] = useState(inOneMonth);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string[]>([]);
  const [filter, setFilter] = useState<GiftCodeStatus | ''>('');
  const [codes, setCodes] = useState<GiftCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setCodes(await giftCodeService.adminList(filter)); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se han podido cargar los códigos.'); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  const choosePlan = (next: GiftPlan) => {
    setPlan(next);
    setDuration(GIFT_DURATIONS[next][next === 'weekend' ? 0 : 1].id);
  };
  const create = async () => {
    const amount = Number(count);
    if (!Number.isInteger(amount) || amount < 1 || amount > 200) { setError('Indica entre 1 y 200 códigos.'); return; }
    setCreating(true);
    setError('');
    try {
      // Se puede canjear hasta el final del día elegido (hora local).
      const until = new Date(`${expires}T23:59:59`).toISOString();
      setCreated(await giftCodeService.adminCreate(plan, duration, amount, until, note));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se han podido crear los códigos.');
    } finally { setCreating(false); }
  };
  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(current => (current === key ? '' : current)), 2000);
  };
  const revoke = async (code: string) => {
    if (!window.confirm(`¿Anular el código ${code}? Ya no se podrá canjear.`)) return;
    try { await giftCodeService.adminRevoke(code); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se ha podido anular el código.'); }
  };

  return (
    <section aria-labelledby="gift-codes-title" className="space-y-5">
      <div className="rounded-2xl border border-line bg-card p-5 shadow-soft">
        <h2 id="gift-codes-title" className="flex items-center gap-2 text-xl font-bold text-ink">
          <Gift size={22} className="text-accent-ink" aria-hidden="true" /> Códigos regalo
        </h2>
        <p className="mt-1 text-sm text-ink-3">Para premios y tarjetas: quien lo canjea al registrarse o desde su perfil obtiene el plan sin pagar. Cada código se usa una sola vez.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-ink-2">Plan
            <select className={`${field} mt-1`} value={plan} onChange={event => choosePlan(event.target.value as GiftPlan)}>
              {(Object.keys(GIFT_PLAN_NAMES) as GiftPlan[]).map(id => <option key={id} value={id}>{GIFT_PLAN_NAMES[id]}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink-2">Duración
            <select className={`${field} mt-1`} value={duration} onChange={event => setDuration(event.target.value as GiftDuration)}>
              {GIFT_DURATIONS[plan].map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink-2">Cantidad
            <input className={`${field} mt-1`} type="number" min={1} max={200} value={count} onChange={event => setCount(event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-ink-2">Canjeable hasta el
            <input className={`${field} mt-1`} type="date" min={new Date().toISOString().slice(0, 10)} value={expires} onChange={event => setExpires(event.target.value)} />
          </label>
          <label className="text-sm font-semibold text-ink-2 sm:col-span-2">Nota (opcional)
            <input className={`${field} mt-1`} maxLength={120} placeholder="Ej.: Torneo de primavera, premio al ganador" value={note} onChange={event => setNote(event.target.value)} />
          </label>
        </div>
        <button type="button" onClick={() => void create()} disabled={creating || !expires}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-semibold text-on-accent disabled:opacity-50">
          {creating && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          Crear {Number(count) > 1 ? `${count} códigos` : 'código'} · {giftCodeLabel(plan, duration)}
        </button>

        {created.length > 0 && (
          <div className="mt-4 rounded-xl border border-accent-ring bg-accent-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ink">{created.length === 1 ? 'Código creado' : `${created.length} códigos creados`}</p>
              <button type="button" onClick={() => void copy(created.join('\n'), 'all')} className="inline-flex items-center gap-1 rounded-lg border border-accent-ring px-2.5 py-1 text-xs font-semibold text-ink">
                <Copy size={13} aria-hidden="true" /> {copied === 'all' ? 'Copiados' : 'Copiar todos'}
              </button>
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {created.map(code => <li key={code} className="rounded-lg bg-card px-2.5 py-1 font-mono text-base font-bold tracking-widest text-ink">{code}</li>)}
            </ul>
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      <div className="rounded-2xl border border-line bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-ink">Códigos creados</h3>
          <div className="flex items-center gap-2">
            <select className="rounded-xl border border-line-2 bg-card px-3 py-2 text-sm text-ink" value={filter} onChange={event => setFilter(event.target.value as GiftCodeStatus | '')} aria-label="Filtrar por estado">
              <option value="">Todos</option>
              {(Object.keys(STATUS) as GiftCodeStatus[]).map(id => <option key={id} value={id}>{STATUS[id].label}</option>)}
            </select>
            <button type="button" onClick={() => void load()} aria-label="Actualizar" className="rounded-xl border border-line-2 p-2 text-ink-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
          </div>
        </div>
        {!loading && codes.length === 0 && <p className="mt-4 text-sm text-ink-3">No hay códigos.</p>}
        <ul className="mt-4 divide-y divide-line">
          {codes.map(item => (
            <li key={item.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <button type="button" onClick={() => void copy(item.code, item.code)} title="Copiar" className="font-mono text-base font-bold tracking-widest text-ink">
                {copied === item.code ? 'Copiado' : item.code}
              </button>
              <span className="text-sm font-semibold text-ink-2">{giftCodeLabel(item.plan, item.duration)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[item.status].classes}`}>{STATUS[item.status].label}</span>
              <span className="min-w-0 flex-1 text-xs text-ink-3">
                {item.status === 'redeemed' && item.redeemed_at
                  ? `Por ${item.redeemed_nick ?? 'una cuenta'} el ${date(item.redeemed_at)}`
                  : `Canjeable hasta el ${date(item.expires_at)}`}
                {item.note && ` · ${item.note}`}
              </span>
              {item.status === 'available' && (
                <button type="button" onClick={() => void revoke(item.code)} className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300">Anular</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
