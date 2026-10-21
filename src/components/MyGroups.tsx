import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import React, { useEffect, useState } from 'react';
import { Users, Copy, Check, Trash2, Crown, ChevronDown, ChevronUp, Archive } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Group } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { PremiumModal } from './PremiumModal';
import { GroupMemberList } from './GroupMemberList';
import { useSubscription } from '../hooks/useSubscription';
import { useTranslation } from 'react-i18next';

interface MyGroupsProps {
  onBack: () => void;
  backDestination?: 'back' | 'home';
  onGroupSelected: (group: Group) => void;
  onGroupArchived?: (groupId: string, archivedAt: string) => void;
  onGroupDeleted?: (groupId: string) => void;
  messagesButton?: React.ReactNode;
}

interface GroupWithCode {
  id: string;
  name: string;
  group_code: string;
  created_at: string;
  created_by?: string;
  user_auth_id?: string;
  hoyo_19_enabled?: boolean;
  archived_at?: string | null;
}

interface MyGroup extends GroupWithCode {
  // owner: lo creó esta cuenta; admin: le han nombrado administrador; member: miembro invitado.
  access: 'owner' | 'admin' | 'member';
}

const GROUP_COLUMNS = 'id, name, group_code, created_at, created_by, user_auth_id, hoyo_19_enabled, archived_at';

export default function MyGroups({ onBack, backDestination = 'back', onGroupSelected, onGroupArchived, onGroupDeleted, messagesButton }: MyGroupsProps) {
  const { t, i18n } = useTranslation();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [groupToArchive, setGroupToArchive] = useState<string | null>(null);
  const [openMembers, setOpenMembers] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // ─── PREMIUM ───
  const [showPremium, setShowPremium] = useState(false);
  const { isPremium, loading: subLoading } = useSubscription(user?.id ?? null);

  useEffect(() => {
    loadGroups();

    // Obtener usuario logueado para el modal Premium
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

  const loadGroups = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError(t('groups.noSession'));
        return;
      }

      setUserEmail(user.email || '');

      const [owned, memberships] = await Promise.all([
        supabase.from('groups').select(GROUP_COLUMNS).eq('user_auth_id', user.id).order('created_at', { ascending: false }),
        supabase.from('group_members').select('role, group_id').eq('user_id', user.id),
      ]);
      if (owned.error) throw owned.error;
      if (memberships.error) throw memberships.error;

      const ownedGroups: MyGroup[] = (owned.data || []).map(group => ({ ...group, access: 'owner' }));
      const ownedIds = new Set(ownedGroups.map(group => group.id));
      const roles = new Map((memberships.data || [])
        .filter(membership => !ownedIds.has(membership.group_id))
        .map(membership => [membership.group_id, membership.role === 'admin' ? 'admin' as const : 'member' as const]));

      let joinedGroups: MyGroup[] = [];
      if (roles.size > 0) {
        const { data, error: joinedError } = await supabase
          .from('groups')
          .select(GROUP_COLUMNS)
          .in('id', [...roles.keys()])
          .order('created_at', { ascending: false });
        if (joinedError) throw joinedError;
        joinedGroups = (data || []).map(group => ({ ...group, access: roles.get(group.id) ?? 'member' }));
      }

      setGroups([...ownedGroups, ...joinedGroups]);
    } catch (err: any) {
      setError(err.message || t('groups.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleDeleteGroup = (groupId: string) => {
    setGroupToDelete(groupId);
  };

  const confirmArchiveGroup = async () => {
    if (!groupToArchive) return;
    try {
      const { data, error: archiveError } = await supabase.rpc('archive_owned_group', { p_group: groupToArchive });
      if (archiveError) throw archiveError;
      setGroups(current => current.map(group => group.id === groupToArchive ? { ...group, archived_at: data } : group));
      onGroupArchived?.(groupToArchive, data);
      setGroupToArchive(null);
    } catch (err: any) {
      setError(err.message || 'No se pudo archivar el grupo');
      setGroupToArchive(null);
    }
  };

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;

    try {
      const { error: deleteError } = await supabase.rpc('delete_archived_owned_group', { p_group: groupToDelete });

      if (deleteError) throw deleteError;

      setGroups(groups.filter(g => g.id !== groupToDelete));
      onGroupDeleted?.(groupToDelete);
      setGroupToDelete(null);
    } catch (err: any) {
      setError(err.message || t('groups.deleteError'));
      setGroupToDelete(null);
    }
  };

  const cancelDeleteGroup = () => {
    setGroupToDelete(null);
  };

  const handleSelectGroup = async (groupWithCode: GroupWithCode) => {
    const group: Group = {
      id: groupWithCode.id,
      name: groupWithCode.name,
      group_code: groupWithCode.group_code,
      created_at: groupWithCode.created_at,
      created_by: groupWithCode.user_auth_id || groupWithCode.created_by,
      hoyo_19_enabled: groupWithCode.hoyo_19_enabled,
      archived_at: groupWithCode.archived_at,
    };
    onGroupSelected(group);
  };

  const accessLabel: Record<MyGroup['access'], string> = {
    owner: 'Creado por ti',
    admin: 'Administrador',
    member: 'Miembro',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-ink-3">{t('groups.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-card rounded-2xl shadow-card p-6 mb-4">
          <TopBar
            className="mb-4"
            left={<NavigationButton destination={backDestination} onClick={onBack} />}
            center={messagesButton}
            right={<>
              {/* Icono Premium (solo si NO es premium y terminó de cargar) */}
              {!subLoading && !isPremium && (
                <button
                  onClick={() => setShowPremium(true)}
                  className="relative group bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-full p-2 transition-all hover:scale-110"
                  title={t('groups.premium')}
                >
                  <Crown size={18} className="text-amber-500" />
                  <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-amber-300 text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Premium
                  </span>
                </button>
              )}

              {/* Icono Premium activo (verde, decorativo) */}
              {isPremium && (
                <div
                  className="bg-emerald-500/10 border border-emerald-500/30 rounded-full p-2"
                  title={t('groups.premiumActive')}
                >
                  <Crown size={18} className="text-accent-ink" />
                </div>
              )}
            </>}
          />

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-full mb-3">
              <Users className="w-8 h-8 text-accent-ink" />
            </div>
            <h1 className="text-2xl font-bold text-ink mb-1">{t('groups.title')}</h1>
            <p className="text-sm text-ink-3">{userEmail}</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {groups.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-ink-3">{t('groups.empty')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="bg-card-2 rounded-xl p-4 transition-colors border border-line"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-ink text-lg break-words">{group.name}</h3>
                      <p className="text-xs font-medium text-ink-3">{accessLabel[group.access]}</p>
                      {group.archived_at && <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Archivado</span>}
                    </div>
                    {group.access === 'owner' && (
                      <WriteButton
                        onClick={() => group.archived_at ? handleDeleteGroup(group.id) : setGroupToArchive(group.id)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title={group.archived_at ? 'Eliminar definitivamente' : 'Archivar grupo'}
                      >
                        {group.archived_at ? <Trash2 size={18} /> : <Archive size={18} />}
                      </WriteButton>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="min-w-0 flex-1 bg-card rounded-lg px-4 py-3 border border-line-2">
                      <p className="text-xs text-ink-3 mb-1">{t('groups.accessCode')}</p>
                      <p className="truncate text-xl font-mono font-bold text-accent-ink tracking-wider">
                        {group.group_code}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopyCode(group.group_code)}
                      className="shrink-0 px-4 py-3 bg-accent text-on-accent rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2"
                      title={t('groups.copyCode')}
                    >
                      {copiedCode === group.group_code ? (
                        <>
                          <Check size={18} />
                          {t('groups.copied')}
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          {t('groups.copy')}
                        </>
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => handleSelectGroup(group)}
                    className="w-full bg-accent text-on-accent px-4 py-2 rounded-lg hover:bg-accent-hover transition-colors font-medium"
                  >
                    {t('groups.select')}
                  </button>

                  <button
                    type="button"
                    onClick={() => setOpenMembers(openMembers === group.id ? null : group.id)}
                    aria-expanded={openMembers === group.id}
                    className="mt-2 w-full flex items-center justify-center gap-2 border border-line bg-card text-ink-2 px-4 py-2 rounded-lg hover:bg-neutral-hover transition-colors font-medium"
                  >
                    <Users size={18} aria-hidden="true" />
                    Jugadores y administradores
                    {openMembers === group.id ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                  </button>

                  {openMembers === group.id && (
                    <div className="mt-4">
                      <GroupMemberList groupId={group.id} ownerId={group.user_auth_id || group.created_by} archived={Boolean(group.archived_at)} />
                    </div>
                  )}

                  <p className="text-xs text-ink-3 mt-2">
                    {t('groups.created', { date: new Intl.DateTimeFormat(i18n.resolvedLanguage).format(new Date(group.created_at)) })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {groupToDelete && (
        <ConfirmModal
          message="Se borrarán definitivamente el grupo, todas sus partidas, clasificaciones y estadísticas. Esta acción no se puede deshacer."
          onConfirm={confirmDeleteGroup}
          onCancel={cancelDeleteGroup}
          requiredText="ELIMINAR"
        />
      )}
      {groupToArchive && (
        <ConfirmModal
          message="El grupo quedará en modo consulta y podrás crear uno nuevo. No se podrán crear más partidas en este grupo."
          onConfirm={confirmArchiveGroup}
          onCancel={() => setGroupToArchive(null)}
        />
      )}

      {/* ─── MODAL PREMIUM ─── */}
      {showPremium && (
        <PremiumModal
          isOpen={showPremium}
          onClose={() => setShowPremium(false)}
          userId={user?.id || ''}
        />
      )}
    </div>
  );
}
