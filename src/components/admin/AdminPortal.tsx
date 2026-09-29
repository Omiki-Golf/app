import { AdminMessages } from './AdminMessages';
import { AdminCourses } from './AdminCourses';
import { AdminRounds } from './AdminRounds';
import { AdminUsers } from './AdminUsers';
import { AdminOverview } from './AdminOverview';
import { AdminGroups } from './AdminGroups';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { adminService, type AdminAccount, type AdminAuditEntry, type AdminDirectoryEntry } from '../../services/adminService';
import { NavigationButton } from '../NavigationButton';
import { ThemeToggle } from '../ThemeToggle';

type Tab = 'overview' | 'users' | 'groups' | 'rounds' | 'messages' | 'courses' | 'audit' | 'admins';
const sections: { title: string; tabs: { id: Tab; label: string }[] }[] = [
  { title: 'Análisis', tabs: [{ id: 'overview', label: 'Panel' }] },
  { title: 'Gestión', tabs: [{ id: 'users', label: 'Jugadores' }, { id: 'groups', label: 'Grupos' }, { id: 'rounds', label: 'Partidas' }, { id: 'messages', label: 'Mensajes' }] },
  { title: 'Sistema', tabs: [{ id: 'courses', label: 'Campos de golf' }, { id: 'audit', label: 'Actividad' }, { id: 'admins', label: 'Administradores' }] },
];

const statuses = { active: 'Activo', invited: 'Pendiente de activar', disabled: 'Desactivado' };
const actions: Record<string, string> = {
  'group.member.handicap': 'Hándicap del grupo modificado',
  'group.member.remove': 'Miembro retirado del grupo',
  'group.member.results': 'Hándicap ajustado por resultados',
  'group.member.results_reverted': 'Ajuste de resultados revertido',
  'message.sent': 'Mensaje enviado',
  'group.message.sent': 'Mensaje enviado por un administrador de grupo',
  'round.complete': 'Partida finalizada',
  'round.reopen': 'Partida reabierta',
  'round.withdraw': 'Partida retirada',
  'round.restore': 'Partida restaurada',
  'user.profile_changed': 'Perfil de jugador modificado',
  'user.plan_changed': 'Plan de jugador modificado',
  'user.restriction_changed': 'Bloqueo de jugador modificado',
  'administrator.bootstrapped': 'Primer administrador creado',
  'administrator.invited': 'Administrador creado',
  'administrator.invitation_sent': 'Enlace de acceso enviado',
  'administrator.status_changed': 'Estado modificado',
  'administrator.password_changed': 'Contraseña actualizada',
  'administrator.login': 'Inicio de sesión',
};
const date = (value: string) => new Date(value).toLocaleString('es-ES');
const errorMessage = (cause: unknown) => cause && typeof cause === 'object' && 'message' in cause
  ? String(cause.message) : 'No se ha podido completar la operación.';

export function AdminPortal({ account, onLogout, onAccessChanged, onChangePassword }: {
  account: AdminAccount;
  onLogout: () => Promise<void>;
  onAccessChanged: () => Promise<void>;
  onChangePassword: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  // Player opened from a Panel list; the menu always returns to the plain list.
  const [focusUser, setFocusUser] = useState<string | undefined>();
  const [admins, setAdmins] = useState<AdminDirectoryEntry[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [target, setTarget] = useState<AdminDirectoryEntry | null>(null);
  const [reason, setReason] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await adminService.recordLogin();
      const [people, events] = await Promise.all([adminService.list(), adminService.audit()]);
      setAdmins(people);
      setAudit(events);
      setHasMore(events.length === 50);
    } catch (cause) {
      setAdmins([]);
      setAudit([]);
      setError(errorMessage(cause));
      await onAccessChanged();
    } finally { setLoading(false); }
  }, [onAccessChanged]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (task: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await task(); } catch (cause) { setError(errorMessage(cause)); }
    finally { operation.current = false; setBusy(false); }
  };

  const invite = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await adminService.invite(alias.trim(), email.trim());
      setShowInvite(false);
      setAlias(''); setEmail('');
      await refresh();
      setMessage(result.emailSent ? 'Cuenta creada. El destinatario recibirá un enlace para establecer su contraseña.' : result.message || 'Cuenta creada; el correo no se ha enviado.');
    });
  };

  const changeState = (event: React.FormEvent) => {
    event.preventDefault();
    if (!target) return;
    const selected = target;
    void run(async () => {
      await adminService.setActive(selected.user_id, selected.status === 'disabled', reason.trim());
      setTarget(null); setReason('');
      await onAccessChanged();
      if (selected.user_id !== account.user_id) await refresh();
      setMessage('Estado del administrador actualizado.');
    });
  };

  return (
    <div className="min-h-screen bg-app text-ink p-4 sm:p-6">
      <main className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck className="text-accent-ink shrink-0" size={28} />
            <div className="min-w-0"><h1 className="font-bold text-xl sm:text-2xl">Administración</h1><p className="text-ink-3 truncate">{account.alias}</p></div>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={onChangePassword} className="text-sm text-accent-ink px-3 py-3">Mi contraseña</button>
            <ThemeToggle />
            <NavigationButton destination="logout" onClick={() => void onLogout()} />
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <nav aria-label="Secciones de administración" className="mb-5 lg:mb-0 lg:sticky lg:top-4 flex gap-1 overflow-x-auto pb-1 lg:pb-0 lg:grid lg:gap-4 lg:overflow-visible">
          {sections.map(section => (
            <div key={section.title} className="flex gap-1 lg:grid lg:gap-0.5">
              <p className="hidden lg:block text-xs uppercase tracking-wider text-ink-4 px-3 mb-1">{section.title}</p>
              {section.tabs.map(item => (
                <button key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined}
                  onClick={() => { setTab(item.id); setFocusUser(undefined); if (item.id === 'audit') void refresh(); }}
                  className={`whitespace-nowrap text-left rounded-xl px-3 py-2.5 text-sm ${tab === item.id ? 'bg-accent text-on-accent font-semibold' : 'text-ink-2 hover:bg-card'}`}>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0">
        {(tab === 'admins' || tab === 'audit') && (
          <div className="flex justify-end mb-3">
            <button disabled={loading || busy} aria-label="Actualizar" title="Actualizar" onClick={() => void refresh()} className="flex h-11 w-11 items-center justify-center bg-card border border-line rounded-full disabled:opacity-50"><RefreshCw size={18} /></button>
          </div>
        )}

        {error && <p role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">{error}</p>}
        {message && <p role="status" className="mb-4 bg-accent-soft text-accent-ink border border-accent-ring p-4 rounded-xl">{message}</p>}

        {tab === 'overview' && <AdminOverview onOpen={setTab} onOpenUser={id => { setFocusUser(id); setTab('users'); }} />}
        {tab === 'groups' && <AdminGroups />}
        {tab === 'courses' && <AdminCourses />}
        {tab === 'messages' && <AdminMessages />}
        {tab === 'rounds' && <AdminRounds />}
        {tab === 'users' && <AdminUsers key={focusUser ?? 'list'} openUserId={focusUser} onExit={() => { setFocusUser(undefined); setTab('overview'); }} />}
        {tab === 'admins' && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-sm text-ink-3">Todos los administradores tienen los mismos permisos.</p>
              <button disabled={busy || loading} onClick={() => { setShowInvite(true); setError(''); setMessage(''); }} className="shrink-0 flex items-center gap-2 bg-accent text-on-accent rounded-xl p-3 disabled:opacity-50"><Plus size={18} /><span className="hidden sm:inline">Crear administrador</span><span className="sr-only sm:hidden">Crear administrador</span></button>
            </div>
            {loading ? <Loader2 className="animate-spin mx-auto my-10" aria-label="Cargando" /> : (
              <div className="space-y-3">
                {admins.map(person => (
                  <article key={person.user_id} className="bg-card border border-line shadow-soft rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold">{person.alias}{person.user_id === account.user_id ? ' (tú)' : ''}</p>
                      <p className="text-sm text-ink-3 break-all">{person.email}</p>
                      <p className={`text-xs mt-2 ${person.status === 'disabled' ? 'text-red-600' : 'text-accent-ink'}`}>{statuses[person.status]}</p>
                      <p className="text-xs text-ink-4 mt-1">Alta: {date(person.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {person.status === 'invited' && <button disabled={busy} onClick={() => void run(async () => {
                        const result = await adminService.resend(person.user_id);
                        await refresh();
                        setMessage(result.emailSent ? 'Enlace de acceso enviado.' : result.message || 'No se pudo enviar el correo.');
                      })} className="border border-line rounded-xl p-3 text-sm disabled:opacity-50">Reenviar acceso</button>}
                      <button disabled={busy || (person.status === 'active' && admins.filter(a => a.status === 'active').length <= 1)}
                        onClick={() => { setTarget(person); setReason(''); setError(''); }}
                        className="border border-line rounded-xl p-3 text-sm text-red-600 disabled:opacity-40">
                        {person.status === 'disabled' ? 'Reactivar' : 'Desactivar'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'audit' && (
          <section className="space-y-3">
            {loading ? <Loader2 className="animate-spin mx-auto my-10" aria-label="Cargando" /> : audit.map(entry => (
              <article key={entry.id} className="bg-card border border-line rounded-xl p-4">
                <div className="flex justify-between flex-wrap gap-2"><p className="font-semibold">{actions[entry.action] || entry.action}</p><time className="text-xs text-ink-3">{date(entry.created_at)}</time></div>
                <p className="text-sm text-ink-2 mt-2">Por {entry.actor_alias}{entry.details.alias ? ` · ${entry.details.alias}` : ''}</p>
                {!entry.action.startsWith('user.') && entry.details.before && entry.details.after && <p className="text-sm text-ink-3 mt-1">{statuses[entry.details.before as keyof typeof statuses] || entry.details.before} → {statuses[entry.details.after as keyof typeof statuses] || entry.details.after}</p>}
                {entry.action.startsWith('user.') && <details className="text-sm mt-2"><summary>Usuario y cambios</summary><p className="break-all">{entry.target_user_id}</p><p>Antes</p><pre className="whitespace-pre-wrap break-words">{JSON.stringify(entry.details.before,null,2)}</pre><p>Después</p><pre className="whitespace-pre-wrap break-words">{JSON.stringify(entry.details.after,null,2)}</pre></details>}
                {entry.details.message_id && <p className="text-sm break-words">{entry.details.title} · {entry.details.recipient_count} destinatarios · {entry.details.message_id}</p>}
                {entry.action.startsWith('group.member.') && <details className="text-sm mt-2"><summary>Grupo y cuentas</summary><p className="break-all">Grupo: {entry.details.group_id}</p><p className="break-all">Actor: {entry.actor_user_id}</p><p className="break-all">Jugador: {entry.target_user_id}</p></details>}
                {entry.details.round_id && <p className="text-sm break-all">Partida: {entry.details.round_id}</p>}
                {entry.details.reason && <p className="text-sm text-ink-3 mt-1">Motivo: {entry.details.reason}</p>}
              </article>
            ))}
            {!loading && !audit.length && <p className="text-ink-3 p-4">No hay actividad registrada.</p>}
            {hasMore && <button disabled={busy} onClick={() => void run(async () => {
              const next = await adminService.audit(audit[audit.length - 1]?.id);
              setAudit(previous => [...previous, ...next]); setHasMore(next.length === 50);
            })} className="bg-card border border-line rounded-xl px-4 py-3">Ver más actividad</button>}
          </section>
        )}

        </div>
        </div>

        {showInvite && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="admin-invite-title" className="bg-card rounded-2xl shadow-card p-6 max-w-md w-full max-h-[90vh] overflow-auto">
              <h2 id="admin-invite-title" className="font-bold text-xl mb-3">Crear administrador</h2>
              <p className="text-sm text-ink-3 mb-5">Utiliza una cuenta distinta de la del jugador. Puede ser un alias de correo como nombre+admin@gmail.com.</p>
              <form onSubmit={invite} className="space-y-4">
                <label className="block text-ink-2">Alias de acceso<input autoFocus required pattern="[A-Za-z][A-Za-z0-9_-]{2,31}" minLength={3} maxLength={32} value={alias} onChange={e => setAlias(e.target.value)} placeholder="AdminK" className="mt-2 w-full bg-card border border-line rounded-xl p-3" /></label>
                <label className="block text-ink-2">Correo administrativo<input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full bg-card border border-line rounded-xl p-3" /></label>
                {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
                <div className="flex gap-3"><button type="button" disabled={busy} onClick={() => setShowInvite(false)} className="flex-1 bg-neutral text-ink rounded-xl py-3">Cancelar</button><button disabled={busy} className="flex-1 bg-accent text-on-accent rounded-xl py-3 disabled:opacity-50">{busy ? 'Creando…' : 'Crear y enviar acceso'}</button></div>
              </form>
            </section>
          </div>
        )}

        {target && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <section role="dialog" aria-modal="true" aria-labelledby="admin-state-title" className="bg-card rounded-2xl shadow-card p-6 max-w-md w-full">
              <h2 id="admin-state-title" className="font-bold text-xl mb-3">{target.status === 'disabled' ? 'Reactivar' : 'Desactivar'} a {target.alias}</h2>
              <p className="text-sm text-ink-3 mb-4">{target.status === 'disabled' ? 'Recuperará el acceso administrativo.' : 'Dejará de poder realizar operaciones administrativas. Su historial se conservará.'}</p>
              <form onSubmit={changeState}>
                <label className="block text-ink-2">Motivo<textarea autoFocus required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className="mt-2 mb-4 w-full bg-card border border-line rounded-xl p-3" /></label>
                {error && <p role="alert" className="text-red-600 text-sm mb-3">{error}</p>}
                <div className="flex gap-3"><button type="button" disabled={busy} onClick={() => setTarget(null)} className="flex-1 bg-neutral text-ink rounded-xl py-3">Cancelar</button><button disabled={busy || reason.trim().length < 3} className="flex-1 bg-red-600 text-white rounded-xl py-3 disabled:opacity-50">{busy ? 'Guardando…' : 'Confirmar'}</button></div>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
