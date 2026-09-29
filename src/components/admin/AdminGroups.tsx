import { useCallback, useEffect, useRef, useState } from 'react';
import { adminService, type ManagedGroup, type ManagedGroupDetail } from '../../services/adminService';
import { NavigationButton } from '../NavigationButton';
import { BarList, Panel, Stat } from './AdminCharts';
import { modeLabels, shortDate, sinceLabel } from './adminFormat';

const input = 'w-full bg-card border border-line rounded-xl p-3';
const errorText = (e: unknown) => e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se pudo completar la operación.';
const products: Record<string, string> = { extra_players: 'Jugadores extra', premium_branding: 'Premium', weekend_mode: 'Modo fin de semana' };
const purchaseStatus: Record<string, string> = { completed: 'Completada', pending: 'Pendiente', failed: 'Fallida' };

export function AdminGroups() {
  const [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const [groups, setGroups] = useState<ManagedGroup[]>([]), [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<ManagedGroupDetail | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const version = useRef(0);

  const load = useCallback(async () => {
    const id = ++version.current;
    setLoading(true); setError('');
    try {
      const data = await adminService.groups(search, page);
      if (id === version.current) { setGroups(data.groups); setTotal(data.total); }
    } catch (e) {
      if (id === version.current) { setGroups([]); setError(errorText(e)); }
    } finally {
      if (id === version.current) setLoading(false);
    }
  }, [search, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const open = async (id: string) => {
    setError(''); setLoading(true);
    try { setSelected(await adminService.group(id)); } catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  };

  if (selected) return <GroupDetail detail={selected} onBack={() => setSelected(null)} />;
  return (
    <section className="space-y-4">
      <h2 className="font-bold text-xl">Grupos</h2>
      <label className="block max-w-md">Buscar
        <input className={input} placeholder="Nombre, código o nick del creador" value={search} maxLength={200}
          onChange={e => { setSearch(e.target.value); setPage(0); }} />
      </label>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {loading ? <p role="status">Cargando…</p> : (
        <div className="grid gap-3">
          {groups.map(g => (
            <button key={g.id} type="button" onClick={() => void open(g.id)} className="text-left w-full bg-card border border-line rounded-xl p-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <span className="min-w-0">
                <span className="block font-semibold truncate">{g.name || 'Sin nombre'} <span className="text-ink-3 font-normal">· {g.group_code}</span>
                  {g.premium_branding && <span className="ml-2 text-xs font-semibold rounded-full px-2 py-0.5 bg-accent-soft text-accent-ink">Premium</span>}</span>
                <span className="block text-sm text-ink-3">Creado por {g.owner_nick || '—'} · {shortDate(g.created_at)}</span>
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-ink-2">
                <span><b>{g.members}</b> miembros{g.guests ? ` + ${g.guests} invitados` : ''}</span>
                <span><b>{g.rounds}</b> partidas ({g.rounds_30} en 30 días)</span>
                <span>Última: {sinceLabel(g.last_round_at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {!loading && !error && !groups.length && <p>No hay grupos con esta búsqueda.</p>}
      <div className="flex items-center gap-3">
        <button disabled={loading || page === 0} onClick={() => setPage(p => p - 1)} className="border rounded-xl p-2 disabled:opacity-40">Anterior</button>
        <span>{total} grupos · Página {page + 1}</span>
        <button disabled={loading || (page + 1) * 25 >= total} onClick={() => setPage(p => p + 1)} className="border rounded-xl p-2 disabled:opacity-40">Siguiente</button>
      </div>
    </section>
  );
}

function GroupDetail({ detail, onBack }: { detail: ManagedGroupDetail; onBack: () => void }) {
  const { group, members, rounds, invitations } = detail;
  return (
    <section className="space-y-4">
      <NavigationButton onClick={onBack} />
      <div>
        <h2 className="text-xl font-bold">{group.name || 'Sin nombre'}</h2>
        <p className="text-sm text-ink-3">Código {group.group_code} · creado por {group.owner_nick || '—'} el {shortDate(group.created_at)}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Miembros con cuenta" value={members.length} detail={group.max_players ? `Máximo ${group.max_players} jugadores` : undefined} />
        <Stat label="Jugadores invitados" value={detail.guests} detail="sin cuenta en la app" />
        <Stat label="Partidas jugadas" value={rounds.played} detail={`${rounds.last_30} en los últimos 30 días`} />
        <Stat label="Última partida" value={sinceLabel(rounds.last_at)} detail={shortDate(rounds.last_at)} />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Panel title="Miembros" note="partidas en este grupo">
          {members.length ? (
            <ul className="grid gap-2 text-sm">
              {members.map(m => (
                <li key={m.user_id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{m.nick || 'Registro pendiente'}{m.role === 'admin' && <span className="ml-2 text-xs text-accent-ink font-semibold">Administra</span>}
                    <span className="block text-xs text-ink-3">Desde {shortDate(m.joined_at)}</span></span>
                  <span className="tabular-nums font-semibold">{m.rounds}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-3">El grupo no tiene miembros con cuenta.</p>}
        </Panel>
        <div className="grid gap-3 content-start">
          <Panel title="Modalidades">
            <BarList empty="Sin partidas." rows={detail.modes.map(m => ({ label: modeLabels[m.mode] ?? m.mode, value: m.count }))} />
          </Panel>
          <Panel title="Campos más jugados">
            <BarList empty="Sin partidas." rows={detail.courses.map(c => ({ label: c.course, value: c.count }))} />
          </Panel>
        </div>
        <Panel title="Invitaciones">
          <p className="text-sm tabular-nums">{invitations.accepted} aceptadas · {invitations.pending} pendientes · {invitations.rejected} rechazadas</p>
        </Panel>
        <Panel title="Compras Pro Shop">
          {detail.purchases.length ? (
            <ul className="grid gap-2 text-sm">
              {detail.purchases.map((p, i) => (
                <li key={`${p.created_at}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span>{products[p.product_type] ?? p.product_type}<span className="block text-xs text-ink-3">{shortDate(p.created_at)}{p.active_until ? ` · hasta ${shortDate(p.active_until)}` : ''}</span></span>
                  <span className="text-xs text-ink-3">{purchaseStatus[p.status] ?? p.status}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-3">Sin compras.</p>}
        </Panel>
      </div>
    </section>
  );
}
