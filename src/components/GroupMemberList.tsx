import { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/userService';
import type { GroupMember } from '../types';
import { WriteButton, useReadOnly } from '../context/ReadOnlyContext';
import { normalizeAvatarUrl } from '../utils/avatarOptions';

// ownerId: creador del grupo. Solo él nombra o retira administradores, y su propio rol no se toca.
export function GroupMemberList({ groupId, ownerId }: { groupId: string; ownerId?: string }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<{ identity: string; members: GroupMember[] } | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const readOnly = useReadOnly();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ member: GroupMember; action: 'handicap' | 'remove'; identity: string } | null>(null);
  const [handicap, setHandicap] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const identity = `${userId ?? ''}:${groupId}`;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let sequence = 0;
    const load = async () => {
      const request = ++sequence;
      try {
        const members = await userService.getGroupMembers(groupId);
        if (active && request === sequence) {
          setState({ identity, members });
          setLoadError('');
        }
      } catch {
        if (active && request === sequence) setLoadError('No se pudieron cargar los miembros. Pulsa Actualizar miembros para reintentarlo.');
      }
    };
    void load();
    const focus = () => void load();
    const timer = window.setInterval(focus, 30000);
    window.addEventListener('focus', focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [groupId, userId, identity, refresh]);
  const apply = async () => {
    if (!edit || edit.identity !== identity || readOnly || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await userService.manageGroupMember(edit.member, edit.action, edit.action === 'handicap' ? Number(handicap.replace(',', '.')) : undefined);
      setEdit(null); setConfirm(false); setRefresh(value => value + 1);
    } catch (err) {
      setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo guardar el cambio');
      setConfirm(false);
    } finally { busyRef.current = false; setBusy(false); }
  };
  const isOwner = !!userId && userId === ownerId;
  const toggleRole = async (member: GroupMember) => {
    if (readOnly || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await userService.updateMemberRole(groupId, member.user_id, member.role === 'admin' ? 'member' : 'admin');
      setRefresh(value => value + 1);
    } catch (err) {
      setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'No se pudo cambiar el rol');
    } finally { busyRef.current = false; setBusy(false); }
  };
  const start = (member: GroupMember, action: 'handicap' | 'remove') => {
    setEdit({ member, action, identity }); setHandicap(member.handicap_18?.toString() ?? ''); setConfirm(false); setError('');
  };
  const validHandicap = handicap.trim() !== '' && Number.isFinite(Number(handicap.replace(',', '.'))) && Number(handicap.replace(',', '.')) >= 0 && Number(handicap.replace(',', '.')) <= 54;
  if (!userId) return null;
  const members = state?.identity === identity ? state.members : null;
  return <section className="space-y-3 mb-6 text-ink">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-accent-soft p-4 rounded-lg">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-title"><Users size={24} />Miembros del grupo{members && ` (${members.length})`}</h2>
      <button className="text-sm border border-line rounded-xl px-3 py-2" onClick={() => setRefresh(value => value + 1)}>Actualizar miembros</button>
    </div>
    <p className="text-sm text-ink-3">Cuentas incorporadas al grupo. Las invitaciones pendientes no aparecen hasta que se aceptan.</p>
    {loadError && <p role="alert" className="text-red-600">{loadError}</p>}
    {!edit && error && <p role="alert" className="text-red-600">{error}</p>}
    {!members && !loadError && <p role="status">Cargando miembros…</p>}
    {members?.map(member => <article key={member.id} className="bg-card border border-line rounded-xl p-3">
      <div className="flex items-center gap-3">
        <img src={normalizeAvatarUrl(member.profile?.avatar_url)} alt="" className="w-12 h-12 rounded-full object-cover" />
        <div className="min-w-0">
          <p className="font-semibold break-words">{member.profile?.nick || member.profile?.display_name || 'Registro pendiente de completar'}</p>
          {member.profile?.display_name && <p className="text-sm break-words">{member.profile.display_name}</p>}
          <p className="text-sm text-ink-3">{member.user_id === ownerId ? 'Creador del grupo' : member.role === 'admin' ? 'Administrador del Grupo' : 'Miembro'}</p>
          <p className="text-sm">{member.handicap_18 === null ? 'Hándicap pendiente' : `Hándicap del grupo (18 hoyos): ${member.handicap_18}`}</p>
        </div>
      </div>
      <details className="text-xs text-ink-3 mt-3"><summary>Detalles</summary><p className="break-all">UUID de cuenta: {member.user_id}</p><p className="break-all">Ficha: {member.player_id}</p></details>
      {(member.can_manage || (isOwner && member.user_id !== ownerId)) && <div className="flex flex-wrap gap-2 mt-3">
        {member.can_manage && <WriteButton className="border border-line rounded-xl px-3 py-2" onClick={() => start(member, 'handicap')}>Editar hándicap</WriteButton>}
        {isOwner && member.user_id !== ownerId && <WriteButton disabled={busy} className="border border-accent text-accent-ink rounded-xl px-3 py-2 disabled:opacity-50" onClick={() => void toggleRole(member)}>{member.role === 'admin' ? 'Quitar administrador' : 'Hacer administrador'}</WriteButton>}
        {member.can_manage && member.can_remove && <WriteButton className="border border-red-400 text-red-500 rounded-xl px-3 py-2" onClick={() => start(member, 'remove')}>Eliminar del grupo</WriteButton>}
      </div>}
      {isOwner && member.user_id !== ownerId && member.role === 'admin' && <p className="text-xs text-ink-3 mt-2">Puede crear partidas y gestionar el grupo contigo.</p>}
    </article>)}
    {members?.length === 0 && !loadError && <p className="text-ink-3">No hay miembros visibles para esta cuenta.</p>}
    {edit?.identity === identity && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="member-edit-title" className="bg-card border border-line rounded-2xl p-5 max-w-lg w-full space-y-4">
        <h3 id="member-edit-title" className="font-semibold text-lg">{edit.action === 'handicap' ? 'Editar hándicap del grupo' : 'Eliminar del grupo'}</h3>
        <p>{edit.member.profile?.nick || edit.member.profile?.display_name || 'Cuenta pendiente'}{edit.member.profile?.display_name && ` · ${edit.member.profile.display_name}`}</p>
        <p className="text-xs break-all text-ink-3">{edit.member.user_id}</p>
        {edit.action === 'handicap' ? <>
          <label className="block">Hándicap para 18 hoyos
            <input type="number" min="0" max="54" step="any" value={handicap} disabled={confirm || busy} onChange={event => setHandicap(event.target.value)} className="block w-full bg-card border border-line rounded-xl p-3 mt-2" />
          </label>
          <p className="text-sm text-ink-3">Solo cambia el hándicap de este grupo. Las partidas existentes conservan el que tenían.</p>
        </> : <p>Se retirará su membresía y se invalidará la invitación anterior. Su cuenta, ficha y resultados se conservan. Para volver necesitará una nueva invitación.</p>}
        {confirm && <p className="font-semibold">{edit.action === 'handicap' ? `Confirmar hándicap: ${handicap} para 18 hoyos.` : 'Confirma la retirada de este jugador.'}</p>}
        {error && <p role="alert" className="text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button disabled={busy} className="border border-line rounded-xl px-4 py-2" onClick={() => setEdit(null)}>Cancelar</button>
          <WriteButton disabled={busy || (edit.action === 'handicap' && !validHandicap)} className="bg-accent text-accent-ink rounded-xl px-4 py-2 disabled:opacity-50" onClick={() => confirm ? void apply() : setConfirm(true)}>{busy ? 'Guardando…' : confirm ? 'Confirmar' : 'Revisar cambio'}</WriteButton>
        </div>
      </div>
    </div>}
  </section>;
}
