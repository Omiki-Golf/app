import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useEffect, useState } from 'react';
import { Users, Copy, Check, Trash2, Crown } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Group } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { PremiumModal } from './PremiumModal';
import { useSubscription } from '../hooks/useSubscription';
import { useTranslation } from 'react-i18next';

interface MyGroupsProps {
  onBack: () => void;
  backDestination?: 'back' | 'home';
  onGroupSelected: (group: Group) => void;
  onLogout: () => void;
}

interface GroupWithCode {
  id: string;
  name: string;
  group_code: string;
  created_at: string;
  created_by?: string;
  user_auth_id?: string;
}

export default function MyGroups({ onBack, backDestination = 'back', onGroupSelected, onLogout }: MyGroupsProps) {
  const { t, i18n } = useTranslation();
  const [groups, setGroups] = useState<GroupWithCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
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

      const { data, error: fetchError } = await supabase
        .from('groups')
        .select('id, name, group_code, created_at, created_by, user_auth_id')
        .eq('user_auth_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setGroups(data || []);
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

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;

    try {
      const { error: deleteError } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupToDelete);

      if (deleteError) throw deleteError;

      setGroups(groups.filter(g => g.id !== groupToDelete));
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
    };
    onGroupSelected(group);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    onLogout();
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
          <div className="flex items-center justify-between mb-4">
            <NavigationButton destination={backDestination}
              onClick={onBack}
              className="flex items-center gap-2 text-ink-3 hover:text-ink transition-colors"
            />

            {/* ─── ICONOS SUPERIOR DERECHA ─── */}
            <div className="flex items-center gap-2">
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

              <NavigationButton destination="logout"
                onClick={handleLogout}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 transition-colors text-sm font-medium"
              />
            </div>
          </div>

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
              <p className="text-ink-3 mb-4">{t('groups.empty')}</p>
              <NavigationButton destination={backDestination}
                onClick={onBack}
                className="text-accent-ink hover:text-accent-ink font-medium"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="bg-card-2 rounded-xl p-4 hover:bg-card-2 transition-colors border border-line"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-ink text-lg">{group.name}</h3>
                    <WriteButton
                      onClick={() => handleDeleteGroup(group.id)}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      title={t('groups.delete')}
                    >
                      <Trash2 size={18} />
                    </WriteButton>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 bg-card rounded-lg px-4 py-3 border border-line-2">
                      <p className="text-xs text-ink-3 mb-1">{t('groups.accessCode')}</p>
                      <p className="text-xl font-mono font-bold text-accent-ink tracking-wider">
                        {group.group_code}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopyCode(group.group_code)}
                      className="px-4 py-3 bg-accent text-on-accent rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2"
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
          message={t('groups.deleteConfirm')}
          onConfirm={confirmDeleteGroup}
          onCancel={cancelDeleteGroup}
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
