import { WriteButton } from '../context/ReadOnlyContext';
import React from 'react';
import { Zap, LogIn, Plus, Share2, User, Users, ChevronRight, FlaskConical, Crown } from 'lucide-react';
import { PlanType, UserProfile } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { ResetExpressRounds } from './ResetExpressRounds';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';

type GroupAccess = 'owner' | 'admin' | 'member';
const ROLE_ORDER: Record<GroupAccess, number> = { owner: 0, admin: 1, member: 2 };

interface HomeScreenProps {
  planType: PlanType;
  isAuthenticated: boolean;
  profile: UserProfile | null;
  onQuickPlay: () => void;
  onJoinQuickPlay: () => void;
  onCreateTeam: () => void;
  groupShortcuts?: Array<{ id: string; name: string; access: 'owner' | 'admin' | 'member' }>;
  onOpenGroup?: (groupId: string) => void;
  onShowProfile: () => void;
  onShowAuth: () => void;
  onShowShare: () => void;
  simulatorEnabled: boolean;
  simulatorUpdating: boolean;
  onToggleSimulator: () => void;
  onCycleSimulatorPlan: () => void;
  messagesButton?: React.ReactNode;
  handicap9?: number;
  handicap18?: number;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  planType,
  isAuthenticated,
  profile,
  onQuickPlay,
  onJoinQuickPlay,
  onCreateTeam,
  groupShortcuts = [],
  onOpenGroup,
  onShowProfile,
  onShowAuth,
  onShowShare,
  simulatorEnabled,
  simulatorUpdating,
  onToggleSimulator,
  onCycleSimulatorPlan,
  messagesButton,
  handicap9,
  handicap18,
}) => {
  const { t } = useTranslation();
  const isExpress = planType === 'express';
  const isTeam = (planType === 'team' || planType === 'premium');
  const fallbackHcp18 = profile?.exact_handicap !== undefined && profile?.exact_handicap !== null
    ? Math.round(profile.exact_handicap)
    : 0;
  const fallbackHcp9 = Math.round(fallbackHcp18 / 2);
  const displayHcp9 = handicap9 ?? fallbackHcp9;
  const displayHcp18 = handicap18 ?? fallbackHcp18;
  const avatarPlanClasses: Record<PlanType, string> = {
    express: 'border-blue-500 bg-blue-500 hover:bg-blue-600',
    player: 'border-emerald-500 bg-emerald-500 hover:bg-emerald-600',
    team: 'border-orange-500 bg-orange-500 hover:bg-orange-600',
    premium: 'border-purple-500 bg-purple-500 hover:bg-purple-600',
  };

  return (
    <div className="min-h-screen bg-app flex justify-center px-4 py-4 sm:py-8 transition-colors">
      <div className="max-w-md w-full">
        {/* Top bar */}
        <div className="relative mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 max-[360px]:gap-1">
            <button
              type="button"
              onClick={onShowShare}
              title={t('common.share')}
              aria-label={t('common.share')}
              className="relative p-2.5 bg-card border border-line rounded-full shadow-soft hover:bg-card-2 transition-all"
            >
              <Share2 size={20} className="text-ink-2" />
            </button>

            {!isAuthenticated && <ThemeToggle />}
          </div>

          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            {messagesButton}
          </div>

          {/* Acceso / Perfil */}
          {!isAuthenticated ? (
            <div className="flex items-center gap-2 max-[360px]:gap-1">
              <LanguageSwitcher />
              {isExpress && <ResetExpressRounds />}
              <button
                type="button"
                onClick={onShowAuth}
                title={t('common.signIn')}
                aria-label={t('common.signIn')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-on-accent shadow-soft transition-all hover:bg-accent-hover active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current max-[360px]:h-10 max-[360px]:w-10"
              >
                <LogIn size={22} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <div className="min-w-0 text-right">
                <p className="max-w-[7rem] truncate text-xs font-bold text-ink">{profile?.nick || t('common.user')}</p>
                <p className="text-xs text-ink-3">HCP {displayHcp9}/{displayHcp18}</p>
              </div>
              <button
                onClick={onShowProfile}
                title={t('common.profile')}
                aria-label={t('common.openProfile')}
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 shadow-soft transition-all ${profile ? avatarPlanClasses[planType] : 'border-line bg-card-2'}`}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full bg-white object-cover ring-1 ring-white/80" />
                ) : (
                  <User size={21} className="text-white" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="mb-3">
            <img src="/images/Omiki_VerdeAmarillo_Trans_Optimizada.png" alt="OMIKI Golf" width={804} height={313} fetchPriority="high" decoding="async" className="mx-auto h-auto w-72 max-w-full object-contain" />
          </h1>
          <p className="text-ink-3">{t('home.tagline')}</p>
        </div>

        {/* Main buttons */}
        <div className="space-y-3 mb-6">
          <WriteButton
            onClick={onQuickPlay}
            className="w-full flex items-center justify-center gap-3 bg-accent text-on-accent px-6 py-4 rounded-2xl hover:bg-accent-hover transition-all font-semibold text-lg shadow-card active:scale-[0.98]"
          >
            <Zap className="w-6 h-6" />
            {t('home.createGame')}
          </WriteButton>

          <WriteButton
            onClick={onJoinQuickPlay}
            className="w-full flex items-center justify-center gap-3 bg-card text-accent-ink border-2 border-accent px-6 py-4 rounded-2xl hover:bg-accent-soft transition-all font-semibold text-lg active:scale-[0.98]"
          >
            <LogIn className="w-6 h-6" />
            {t('home.joinGame')}
          </WriteButton>


          {/* Orden por rol: Creador, Administrador y Miembro (estable dentro de cada rol). */}
          {[...groupShortcuts].sort((a, b) => ROLE_ORDER[a.access] - ROLE_ORDER[b.access]).map(group => {
            const managesGroup = group.access === 'owner' || group.access === 'admin';
            return <WriteButton
              key={group.id}
              onClick={() => onOpenGroup?.(group.id)}
              className={`w-full flex items-center justify-center gap-3 border-2 px-6 py-4 rounded-2xl transition-all font-semibold text-lg active:scale-[0.98] ${managesGroup
                ? 'border-amber-500 bg-amber-500 text-amber-950 shadow-card hover:bg-amber-600'
                : 'border-amber-500 bg-card text-amber-500 hover:bg-amber-500/10'}`}
            >
              <Users className="w-6 h-6" aria-hidden="true" />
              <span className="min-w-0 truncate">{group.name}</span>
              {group.access === 'owner' && <span className="relative h-7 w-9 shrink-0" title="Creador" aria-label="Creador"><Crown size={20} fill="currentColor" className="absolute left-0 top-1" /><Crown size={20} fill="currentColor" className="absolute right-0 top-0" /></span>}
              {group.access === 'admin' && <Crown size={21} fill="currentColor" className="shrink-0" aria-label="Administrador" />}
            </WriteButton>;
          })}

          {isTeam && groupShortcuts.every(group => group.access !== 'owner') && (
            <WriteButton
              onClick={onCreateTeam}
              className="w-full flex items-center justify-center gap-3 bg-amber-500 text-amber-950 px-6 py-4 rounded-2xl hover:bg-amber-600 transition-all font-semibold text-lg shadow-card active:scale-[0.98]"
            >
              <Plus className="w-6 h-6" aria-hidden="true" />
              <span className="truncate">{t('home.createTeam')}</span>
            </WriteButton>
          )}
        </div>

        <img src="/images/Omiki_O_VerdeAmarillo_Trans_Optimizada.png" alt="" aria-hidden="true" width={280} height={342} loading="lazy" decoding="async" className="mx-auto h-auto w-28 object-contain" />

        <div className="hidden mt-6 flex-wrap items-center justify-center gap-3" aria-hidden="true">
          <WriteButton
            type="button"
            onClick={onToggleSimulator}
            disabled={simulatorUpdating}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all disabled:opacity-60 ${
              simulatorEnabled
                ? 'bg-blue-600 text-white shadow-soft'
                : 'bg-card text-ink-3 border border-line hover:bg-card-2'
            }`}
          >
            <FlaskConical size={14} />
            {t('home.simulator')}
          </WriteButton>

          {simulatorEnabled && (
            <WriteButton
              type="button"
              onClick={onCycleSimulatorPlan}
              disabled={simulatorUpdating}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-card text-ink-2 shadow-soft hover:bg-card-2 transition-all border border-line disabled:opacity-60"
            >
              <span>{t('home.plan', { plan: planType })}</span>
              <ChevronRight size={14} className="text-ink-4" />
            </WriteButton>
          )}

        </div>

        {simulatorEnabled && (
          <p className="hidden text-center text-xs text-ink-4 mt-2" aria-hidden="true">
            {t('home.preview', { user: profile?.nick || t('common.user'), plan: planType })}
          </p>
        )}

      </div>
    </div>
  );
};
