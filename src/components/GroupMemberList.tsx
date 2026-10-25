import { useEffect, useRef, useState } from 'react';
import { Crown, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/userService';
import type { GroupMember, UserProfile } from '../types';
import { WriteButton, useReadOnly } from '../context/ReadOnlyContext';
import { normalizeAvatarUrl } from '../utils/avatarOptions';

// HCP de 9 hoyos a partir del de 18: si no es entero se redondea y se marca con * (4,5 → 5*).
const handicap9 = (handicap18: number) => {
  const half = handicap18 / 2;
  return Number.isInteger(half) ? String(half) : `${Math.round(half)}*`;
};

export function GroupMemberList({ groupId, ownerId, archived = false }: { groupId: string; ownerId?: string; archived?: boolean }) {
  const { user } = useAuth();
  const userId = user?.id;
  const identity = `${userId ?? ''}:${groupId}`;
  const readOnly = useReadOnly();
  const busyRef = useRef(false);
  const [state, setState] = useState<{ identity: string; members: GroupMember[] } | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ member: GroupMember; action: 'handicap' | 'remove'; identity: string } | null>(null);
  const [handicap, setHandicap] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [guestHandicap18, setGuestHandicap18] = useState('');
  const [invitationStatuses, setInvitationStatuses] = useState<Record<string, 'pending' | 'accepted' | 'rejected'>>({});
  const [invitedProfiles, setInvitedProfiles] = useState<Array<{ profile: UserProfile; status: 'pending' | 'accepted' | 'rejected' }>>([]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      try {
        const [members, invitations] = await Promise.all([userService.getGroupMembers(groupId), userService.getGroupInvitationStatuses(groupId)]);
        if (active) {
          setState({ identity, members });
          setInvitationStatuses(Object.fromEntries(invitations.map(invitation => [invitation.userId, invitation.status])));
          setInvitedProfiles(invitations.filter(invitation => invitation.profile).map(invitation => ({ profile: invitation.profile!, status: invitation.status })));
          setLoadError('');
        }
      } catch { if (active) setLoadError('No se pudieron cargar los jugadores. Pulsa Actualizar para reintentarlo.'); }
    };
    void load();
    const focus = () => void load();
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    const restored = () => void load();
    const timer = window.setInterval(focus, 30000);
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', restored);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('pageshow', restored); document.removeEventListener('visibilitychange', visible); };
  }, [groupId, userId, identity, refresh]);

  useEffect(() => {
    const term = searchName.trim();
    if (term.length < 2) { setSearchResults([]); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await userService.searchByNick(term);
        if (active) setSearchResults(results.filter(result => result.user_id !== userId));
      } catch { if (active) setSearchResults([]); }
      finally { if (active) setSearching(false); }
    }, 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [searchName, userId]);

  const members = state?.identity === identity ? state.members : null;
  const isOwner = !!userId && userId === ownerId;
  const canManage = members?.some(member => member.can_manage) ?? false;
  const delegatedAdminExists = members?.some(member => member.user_id !== ownerId && member.role === 'admin') ?? false;
  const validHandicap = handicap.trim() !== '' && Number.isFinite(Number(handicap.replace(',', '.'))) && Number(handicap.replace(',', '.')) >= 0 && Number(handicap.replace(',', '.')) <= 54;
  const start = (member: GroupMember, action: 'handicap' | 'remove') => { setEdit({ member, action, identity }); setHandicap(member.handicap_18?.toString() ?? ''); setConfirm(false); setError(''); };

  const apply = async () => {
    if (!edit || edit.identity !== identity || readOnly || archived || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await userService.manageGroupMember(edit.member, edit.action, edit.action === 'handicap' ? Number(handicap.replace(',', '.')) : undefined);
      setEdit(null); setConfirm(false); setRefresh(value => value + 1);
    } catch (err) { setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo guardar el cambio'); setConfirm(false); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const toggleRole = async (member: GroupMember) => {
    if (!member.user_id || readOnly || archived || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await userService.updateMemberRole(groupId, member.user_id, member.role === 'admin' ? 'member' : 'admin'); setRefresh(value => value + 1); }
    catch (err) { setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo cambiar el rol'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const inviteRegistered = async (profile: UserProfile) => {
    if (!userId || readOnly || archived || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const status = await userService.sendInvitation(groupId, profile.user_id, userId, 'Te han invitado al grupo');
      setInvitationStatuses(current => ({ ...current, [profile.user_id]: status }));
      setInvitedProfiles(current => [...current.filter(item => item.profile.user_id !== profile.user_id), { profile, status }]);
      setError(status === 'pending' ? `Invitación enviada a ${profile.nick}.` : status === 'accepted' ? `${profile.nick} ya es miembro.` : `${profile.nick} rechazó la invitación.`);
    }
    catch (err) { setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo enviar la invitación'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const addGuest = async () => {
    const name = searchName.trim();
    const value = guestHandicap18.trim() === '' ? Number.NaN : Number(guestHandicap18.replace(',', '.'));
    if (name.length < 2 || !Number.isFinite(value) || value < 0 || value > 54) { setError('Indica un nombre y un HCP de 18 hoyos entre 0 y 54'); return; }
    if (readOnly || archived || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await userService.addGroupGuest(groupId, name, value); setSearchName(''); setSearchResults([]); setGuestHandicap18(''); setShowAdd(false); setRefresh(value => value + 1); }
    catch (err) { setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo añadir el jugador'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const deleteRejectedInvitation = async (invitedUserId: string) => {
    if (readOnly || archived || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await userService.deleteRejectedInvitation(groupId, invitedUserId);
      setInvitedProfiles(current => current.filter(item => item.profile.user_id !== invitedUserId));
      setInvitationStatuses(current => {
        const next = { ...current };
        delete next[invitedUserId];
        return next;
      });
    } catch (err) { setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo eliminar la invitación rechazada'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const visibleInvitations = invitedProfiles.filter(item => !members?.some(member => member.user_id === item.profile.user_id));
  const rosterCount = (members?.length ?? 0) + visibleInvitations.length;
  const invitationSections = (['accepted', 'pending', 'rejected'] as const).map(status => ({
    status,
    items: visibleInvitations.filter(item => item.status === status),
    title: status === 'accepted' ? 'Aceptadas' : status === 'pending' ? 'Pendientes' : 'Rechazadas',
  })).filter(section => section.items.length > 0);

  if (!userId) return null;
  return <section className="space-y-3 mb-6 text-ink">
    <div className="flex flex-wrap items-center justify-between gap-2 bg-accent-soft p-3 rounded-lg">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-title"><Users size={20} />Jugadores{members && ` (${rosterCount})`}</h2>
      <div className="flex gap-2">{!archived && canManage && <WriteButton className="text-sm bg-accent text-on-accent rounded-lg px-3 py-1.5" onClick={() => setShowAdd(value => !value)}><UserPlus size={16} className="inline mr-1" />Añadir</WriteButton>}<button className="text-sm border border-line rounded-lg px-3 py-1.5" onClick={() => setRefresh(value => value + 1)}>Actualizar</button></div>
    </div>
    {showAdd && canManage && <div className="border border-line rounded-xl p-3 space-y-3">
      <div className="relative"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" /><input value={searchName} onChange={event => setSearchName(event.target.value)} placeholder="Nick o nombre del jugador..." className="w-full pl-9 pr-3 py-2 border border-line rounded-lg bg-card" /></div>
      {searchResults.map(profile => { const invitationStatus = invitationStatuses[profile.user_id]; const alreadyMember = members?.some(member => member.user_id === profile.user_id); return <button key={profile.user_id} disabled={busy || alreadyMember || Boolean(invitationStatus)} onClick={() => void inviteRegistered(profile)} className="w-full flex items-center gap-2 p-2 rounded-lg bg-card-2 disabled:opacity-70 text-left"><img src={normalizeAvatarUrl(profile.avatar_url)} alt="" className="w-8 h-8 rounded-full" /><span className="min-w-0 flex-1"><span className="block font-medium truncate">{profile.nick}</span><span className="block text-xs text-ink-3">HCP 18: {(profile.exact_handicap ?? 0).toFixed(1)}</span></span><span className="shrink-0 text-xs font-medium">{alreadyMember ? 'Miembro' : invitationStatus === 'pending' ? 'Invitación pendiente' : invitationStatus === 'accepted' ? 'Invitación aceptada' : invitationStatus === 'rejected' ? 'Invitación rechazada' : <UserPlus size={17} />}</span></button>; })}
      {searchName.trim().length >= 2 && !searching && !searchResults.some(profile => profile.nick.toLocaleLowerCase() === searchName.trim().toLocaleLowerCase()) && <div className="bg-card-2 rounded-lg p-3"><p className="text-sm mb-2">Añadir “{searchName.trim()}” sin cuenta</p><div className="flex gap-2"><input type="number" min="0" max="54" step="0.1" value={guestHandicap18} onChange={event => setGuestHandicap18(event.target.value)} placeholder="HCP 18 hoyos" className="min-w-0 flex-1 px-3 py-2 border border-line rounded-lg bg-card" /><WriteButton disabled={busy} onClick={() => void addGuest()} className="bg-accent text-on-accent rounded-lg px-3">Añadir</WriteButton></div><p className="text-xs text-ink-3 mt-2">Para 9 hoyos se divide entre dos y se redondea.</p></div>}
    </div>}
    <p className="text-xs text-ink-3">HCP: <strong className="text-accent-ink">18 hoyos</strong> <span className="text-ink-4">|</span> <strong className="text-amber-700">9 hoyos</strong> (* redondeado). Los jugadores sin cuenta son miembros del grupo. Las invitaciones muestran su estado hasta que se aceptan.</p>
    {loadError && <p role="alert" className="text-red-600">{loadError}</p>}{!edit && error && <p role="status" className="text-sm text-ink-3">{error}</p>}{!members && !loadError && <p role="status">Cargando jugadores…</p>}
    {members?.map(member => <article key={member.id} className="bg-card border border-line rounded-xl px-3 py-2">
      <div className="flex items-center gap-2">{member.user_id ? <img src={normalizeAvatarUrl(member.profile?.avatar_url)} alt="" className="w-9 h-9 shrink-0 rounded-full object-cover" /> : <div aria-hidden="true" className="w-9 h-9 shrink-0 rounded-full bg-accent text-on-accent flex items-center justify-center font-bold uppercase">{(member.profile?.nick || '?').trim().charAt(0)}</div>}<div className="min-w-0 flex-1"><p className="font-semibold truncate whitespace-nowrap">{member.profile?.nick || 'Registro pendiente'}</p><p className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-3">{member.user_id === ownerId ? <span className="font-semibold text-ink">Creador</span> : member.role === 'admin' ? <span className="inline-flex items-center gap-1"><Crown size={13} className="shrink-0 text-amber-500" fill="currentColor" aria-hidden="true" />Admin</span> : 'Miembro'}<span aria-hidden="true">·</span>{member.handicap_18 === null ? <span>HCP pendiente</span> : <span aria-label={`HCP ${member.handicap_18} en 18 hoyos y ${handicap9(member.handicap_18)} en 9 hoyos`}>HCP <strong className="text-accent-ink">{member.handicap_18}</strong> <span aria-hidden="true" className="text-ink-4">|</span> <strong className="text-amber-700">{handicap9(member.handicap_18)}</strong></span>}</p></div>
        {!archived && isOwner && member.user_id && member.user_id !== ownerId && <button type="button" aria-label={member.role === 'admin' ? 'Quitar administrador' : 'Hacer administrador'} disabled={busy || (member.role !== 'admin' && delegatedAdminExists)} onClick={() => void toggleRole(member)} title={member.role !== 'admin' && delegatedAdminExists ? 'Ya hay otro administrador' : member.role === 'admin' ? 'Quitar administrador' : 'Hacer administrador'} className={`shrink-0 p-1.5 rounded-full disabled:opacity-40 ${member.role === 'admin' ? 'text-amber-500 bg-amber-500/15' : 'text-ink-4 bg-card-2'}`}><Crown size={19} fill={member.role === 'admin' ? 'currentColor' : 'none'} /></button>}
        {!archived && member.can_manage && member.can_remove && <WriteButton title="Eliminar del grupo" aria-label={`Eliminar a ${member.profile?.nick || 'jugador'} del grupo`} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg" onClick={() => start(member, 'remove')}><Trash2 size={18} /></WriteButton>}
      </div>{!archived && member.can_manage && <button className="ml-11 mt-1 text-xs text-accent-ink underline" onClick={() => start(member, 'handicap')}>Editar HCP</button>}
    </article>)}
    {invitationSections.map(section => <section key={section.status} className="space-y-1.5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-3">{section.title} ({section.items.length})</h3>
      {section.items.map(item => <article key={`invited:${item.profile.user_id}`} className="flex w-full items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
        <img src={normalizeAvatarUrl(item.profile.avatar_url)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        <span className="min-w-0 flex-1 truncate font-semibold">{item.profile.nick}</span>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${section.status === 'accepted' ? 'bg-accent-soft text-accent-ink' : section.status === 'rejected' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-700'}`}>{section.status === 'accepted' ? 'Aceptada' : section.status === 'pending' ? 'Pendiente' : 'Rechazada'}</span>
        {section.status === 'rejected' && canManage && <WriteButton type="button" disabled={busy} onClick={() => void deleteRejectedInvitation(item.profile.user_id)} title="Eliminar invitación rechazada" aria-label={`Eliminar la invitación rechazada de ${item.profile.nick}`} className="shrink-0 rounded-lg p-2 text-red-500 hover:bg-red-500/10"><Trash2 size={17} /></WriteButton>}
      </article>)}
    </section>)}
    {members?.length === 0 && !loadError && <p className="text-ink-3">No hay jugadores en el grupo.</p>}
    {edit?.identity === identity && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-labelledby="member-edit-title" className="bg-card border border-line rounded-2xl p-5 max-w-lg w-full space-y-4"><h3 id="member-edit-title" className="font-semibold text-lg">{edit.action === 'handicap' ? 'Editar hándicap del grupo' : 'Eliminar del grupo'}</h3><p>{edit.member.profile?.nick || 'Jugador'}</p>{edit.action === 'handicap' ? <label className="block">Hándicap para 18 hoyos<input type="number" min="0" max="54" step="any" value={handicap} disabled={confirm || busy} onChange={event => setHandicap(event.target.value)} className="block w-full bg-card border border-line rounded-xl p-3 mt-2" /></label> : <p>Se retirará este jugador del grupo. Sus resultados anteriores se conservan.</p>}{confirm && <p className="font-semibold">{edit.action === 'handicap' ? `Confirmar HCP 18: ${handicap}.` : 'Confirma la retirada de este jugador.'}</p>}{error && <p role="alert" className="text-red-500">{error}</p>}<div className="flex gap-3"><button disabled={busy} className="border border-line rounded-xl px-4 py-2" onClick={() => setEdit(null)}>Cancelar</button><WriteButton disabled={busy || (edit.action === 'handicap' && !validHandicap)} className="bg-accent text-on-accent rounded-xl px-4 py-2 disabled:opacity-50" onClick={() => confirm ? void apply() : setConfirm(true)}>{busy ? 'Guardando…' : confirm ? 'Confirmar' : 'Revisar cambio'}</WriteButton></div></div></div>}
  </section>;
}
