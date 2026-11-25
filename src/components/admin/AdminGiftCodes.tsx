import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Copy, Download, Gift, Loader2, RefreshCw, Search } from 'lucide-react';
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
const STATUS_ORDER: GiftCodeStatus[] = ['available', 'redeemed', 'expired', 'revoked'];
const date = (value: string) => new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dayInput = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const inOneMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return dayInput(d); };
// Se puede canjear hasta el final del día elegido (hora local).
const endOfDay = (day: string) => new Date(`${day}T23:59:59`).toISOString();
const field = 'w-full rounded-xl border border-line-2 bg-card px-3 py-2.5 text-sm text-ink';

const csvCell = (value: string | null | undefined) => `"${(value ?? '').replace(/"/g, '""')}"`;
function downloadCsv(rows: GiftCodeRow[]) {
  const header = ['Código', 'Plan', 'Duración', 'Estado', 'Nota', 'Creado', 'Canjeable hasta', 'Canjeado por', 'Canjeado el', 'Anulado el'];
  const lines = rows.map(row => [
    row.code, GIFT_PLAN_NAMES[row.plan], GIFT_DURATIONS[row.plan].find(item => item.id === row.duration)?.label ?? row.duration,
    STATUS[row.status].label, row.note, date(row.created_at), date(row.expires_at), row.redeemed_nick,
    row.redeemed_at ? date(row.redeemed_at) : '', row.revoked_at ? date(row.revoked_at) : '',
  ].map(csvCell).join(';'));
  // BOM para que Excel lea bien los acentos; «;» como separador en configuración española.
  const blob = new Blob(['﻿' + [header.map(csvCell).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `codigos-regalo-${dayInput(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminGiftCodes() {
  const [plan, setPlan] = useState<GiftPlan>('player');
  const [duration, setDuration] = useState<GiftDuration>('annual');
  const [count, setCount] = useState('1');
  const [expires, setExpires] = useState(inOneMonth);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string[]>([]);
  const [codes, setCodes] = useState<GiftCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  // Filtros y vista de la lista.
  const [statusFilter, setStatusFilter] = useState<GiftCodeStatus | ''>('');
  const [planFilter, setPlanFilter] = useState<GiftPlan | ''>('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'codes' | 'batches'>('codes');
  const [editing, setEditing] = useState<{ code: string; day: string } | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setCodes(await giftCodeService.adminList()); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se han podido cargar los códigos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => Object.fromEntries(STATUS_ORDER.map(id => [id, codes.filter(item => item.status === id).length])) as Record<GiftCodeStatus, number>, [codes]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return codes.filter(item =>
      (!statusFilter || item.status === statusFilter) &&
      (!planFilter || item.plan === planFilter) &&
      (!term || item.code.toLowerCase().includes(term) || (item.note ?? '').toLowerCase().includes(term) || (item.redeemed_nick ?? '').toLowerCase().includes(term)));
  }, [codes, statusFilter, planFilter, search]);
  // Tandas: códigos creados juntos (misma nota, plan y fecha de creación).
  const batches = useMemo(() => {
    const groups = new Map<string, GiftCodeRow[]>();
    for (const item of filtered) {
      const key = item.batch_id ?? item.code;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([id, rows]) => ({ id, rows, first: rows[0] }));
  }, [filtered]);

  const choosePlan = (next: GiftPlan) => {
    setPlan(next);
    setDuration(GIFT_DURATIONS[next][next === 'weekend' ? 0 : 1].id);
  };
  const run = async (key: string, action: () => Promise<void>, fallback: string) => {
    setBusy(key);
    setError('');
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : fallback); }
    finally { setBusy(''); }
  };
  const create = async () => {
    const amount = Number(count);
    if (!Number.isInteger(amount) || amount < 1 || amount > 200) { setError('Indica entre 1 y 200 códigos.'); return; }
    setCreating(true);
    await run('create', async () => { setCreated(await giftCodeService.adminCreate(plan, duration, amount, endOfDay(expires), note)); }, 'No se han podido crear los códigos.');
    setCreating(false);
  };
  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(current => (current === key ? '' : current)), 2000);
  };
  const revoke = (code: string) => {
    if (!window.confirm(`¿Dar de baja el código ${code}? Ya no se podrá canjear.`)) return;
    void run(code, () => giftCodeService.adminRevoke(code), 'No se ha podido anular el código.');
  };
  const revokeBatch = (batchId: string, available: number) => {
    if (!window.confirm(`¿Dar de baja los ${available} códigos disponibles de esta tanda? Los canjeados no cambian.`)) return;
    void run(batchId, async () => { await giftCodeService.adminRevokeBatch(batchId); }, 'No se ha podido anular la tanda.');
  };
  const saveExpiry = () => {
    if (!editing) return;
    const { code, day } = editing;
    void run(code, async () => { await giftCodeService.adminSetExpiry(code, endOfDay(day)); setEditing(null); }, 'No se ha podido cambiar la fecha.');
  };

  const codeRow = (item: GiftCodeRow, showPlan = true) => {
    const editable = item.status === 'available' || item.status === 'expired';
    return (
      <li key={item.code} className="py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={() => void copy(item.code, item.code)} title="Copiar" className="font-mono text-base font-bold tracking-widest text-ink">
            {copied === item.code ? 'Copiado' : item.code}
          </button>
          {showPlan && <span className="text-sm font-semibold text-ink-2">{giftCodeLabel(item.plan, item.duration)}</span>}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[item.status].classes}`}>{STATUS[item.status].label}</span>
          <span className="min-w-0 flex-1 text-xs text-ink-3">
            {item.status === 'redeemed' && item.redeemed_at
              ? `Por ${item.redeemed_nick ?? 'una cuenta'} el ${date(item.redeemed_at)}`
              : item.status === 'revoked' && item.revoked_at
              ? `Dado de baja el ${date(item.revoked_at)}`
              : `${item.status === 'expired' ? 'Caducó' : 'Canjeable hasta'} el ${date(item.expires_at)}`}
            {showPlan && item.note && ` · ${item.note}`}
          </span>
          {editable && editing?.code !== item.code && (
            <button type="button" onClick={() => setEditing({ code: item.code, day: inOneMonth() })}
              className="inline-flex items-center gap-1 rounded-lg border border-line-2 px-2.5 py-1 text-xs font-semibold text-ink-2">
              <CalendarClock size={13} aria-hidden="true" /> {item.status === 'expired' ? 'Reactivar' : 'Cambiar fecha'}
            </button>
          )}
          {item.status === 'available' && (
            <button type="button" onClick={() => revoke(item.code)} disabled={busy === item.code}
              className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 disabled:opacity-50 dark:text-red-300">Dar de baja</button>
          )}
        </div>
        {editing?.code === item.code && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-ink-2" htmlFor={`expiry-${item.code}`}>Canjeable hasta el</label>
            <input id={`expiry-${item.code}`} type="date" min={dayInput(new Date())} value={editing.day}
              onChange={event => setEditing({ code: item.code, day: event.target.value })}
              className="rounded-lg border border-line-2 bg-card px-2 py-1 text-sm text-ink" />
            <button type="button" onClick={saveExpiry} disabled={!editing.day || busy === item.code}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-on-accent disabled:opacity-50">Guardar</button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-3">Cancelar</button>
          </div>
        )}
      </li>
    );
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
            <input className={`${field} mt-1`} type="date" min={dayInput(new Date())} value={expires} onChange={event => setExpires(event.target.value)} />
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
          <h3 className="text-lg font-bold text-ink">Gestionar códigos</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => downloadCsv(filtered)} disabled={!filtered.length}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line-2 px-3 py-2 text-sm font-semibold text-ink-2 disabled:opacity-50">
              <Download size={15} aria-hidden="true" /> CSV
            </button>
            <button type="button" onClick={() => void load()} aria-label="Actualizar" className="rounded-xl border border-line-2 p-2 text-ink-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Resumen: cada contador filtra la lista por ese estado. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUS_ORDER.map(id => (
            <button key={id} type="button" aria-pressed={statusFilter === id} onClick={() => setStatusFilter(current => (current === id ? '' : id))}
              className={`rounded-xl border p-3 text-left transition-colors ${statusFilter === id ? 'border-accent bg-accent-soft' : 'border-line bg-card-2'}`}>
              <span className="block text-2xl font-black tabular-nums text-ink">{counts[id]}</span>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[id].classes}`}>{STATUS[id].label}s</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[12rem] flex-1">
            <span className="sr-only">Buscar</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar código, nota o nick"
              className="w-full rounded-xl border border-line-2 bg-card py-2 pl-9 pr-3 text-sm text-ink" />
          </label>
          <select className="rounded-xl border border-line-2 bg-card px-3 py-2 text-sm text-ink" value={planFilter} onChange={event => setPlanFilter(event.target.value as GiftPlan | '')} aria-label="Filtrar por plan">
            <option value="">Todos los planes</option>
            {(Object.keys(GIFT_PLAN_NAMES) as GiftPlan[]).map(id => <option key={id} value={id}>{GIFT_PLAN_NAMES[id]}</option>)}
          </select>
          <select className="rounded-xl border border-line-2 bg-card px-3 py-2 text-sm text-ink" value={statusFilter} onChange={event => setStatusFilter(event.target.value as GiftCodeStatus | '')} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS[id].label}</option>)}
          </select>
          <div role="group" aria-label="Vista" className="inline-flex rounded-xl border border-line-2 p-0.5">
            {([['codes', 'Por código'], ['batches', 'Por tanda']] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === id ? 'bg-accent text-on-accent' : 'text-ink-2'}`}>{label}</button>
            ))}
          </div>
        </div>

        {!loading && filtered.length === 0 && <p className="mt-4 text-sm text-ink-3">No hay códigos con estos filtros.</p>}

        {view === 'codes' ? (
          <ul className="mt-2 divide-y divide-line">{filtered.map(item => codeRow(item))}</ul>
        ) : (
          <div className="mt-4 space-y-3">
            {batches.map(({ id, rows, first }) => {
              // Lo que se da de baja es toda la tanda, aunque los filtros oculten parte de ella.
              const available = codes.filter(item => (item.batch_id ?? item.code) === id && item.status === 'available').length;
              const used = rows.filter(item => item.status === 'redeemed').length;
              return (
                <details key={id} className="rounded-xl border border-line bg-card-2 p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-ink">{first.note || 'Sin nota'}</span>
                    <span className="text-sm text-ink-2">{giftCodeLabel(first.plan, first.duration)}</span>
                    <span className="text-xs text-ink-3">Creada el {date(first.created_at)} · {rows.length} {rows.length === 1 ? 'código' : 'códigos'} · {used} canjeados · {available} disponibles</span>
                    {available > 0 && first.batch_id && (
                      <button type="button" onClick={event => { event.preventDefault(); revokeBatch(first.batch_id as string, available); }} disabled={busy === first.batch_id}
                        className="ml-auto rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 disabled:opacity-50 dark:text-red-300">
                        Dar de baja los disponibles
                      </button>
                    )}
                  </summary>
                  <ul className="mt-2 divide-y divide-line">{rows.map(item => codeRow(item, false))}</ul>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
