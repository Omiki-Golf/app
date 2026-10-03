import { WriteButton } from '../context/ReadOnlyContext';
import React from 'react';
import { Zap, LogIn, Plus, Share2, Bell, User, ChevronRight, FlaskConical } from 'lucide-react';
import { PlanType, UserProfile } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { ResetExpressRounds } from './ResetExpressRounds';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';

interface HomeScreenProps {
  planType: PlanType;
  isAuthenticated: boolean;
  profile: UserProfile | null;
  pendingInvitations: number;
  onQuickPlay: () => void;
  onJoinQuickPlay: () => void;
  onCreateTeam: () => void;
  onShowProfile: () => void;
  onShowNotifications: () => void;
  onShowAuth: () => void;
  onShowShare: () => void;
  simulatorEnabled: boolean;
  simulatorUpdating: boolean;
  onToggleSimulator: () => void;
  onCycleSimulatorPlan: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  planType,
  isAuthenticated,
  profile,
  pendingInvitations,
  onQuickPlay,
  onJoinQuickPlay,
  onCreateTeam,
  onShowProfile,
  onShowNotifications,
  onShowAuth,
  onShowShare,
  simulatorEnabled,
  simulatorUpdating,
  onToggleSimulator,
  onCycleSimulatorPlan,
}) => {
  const { t } = useTranslation();
  const isExpress = planType === 'express';
  const isTeam = (planType === 'team' || planType === 'premium');

  return (
    <div className="min-h-screen bg-app flex justify-center px-4 py-4 sm:py-8 transition-colors">
      <div className="max-w-md w-full">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onShowShare}
              title={t('common.share')}
              aria-label={t('common.share')}
              className="relative p-2.5 bg-card border border-line rounded-full shadow-soft hover:bg-card-2 transition-all"
            >
              <Share2 size={20} className="text-ink-2" />
            </button>

            <>
              <button
                type="button"
                onClick={onShowNotifications}
                title={t('common.notifications')}
                aria-label={t('common.notifications')}
                className="relative p-2.5 bg-card border border-line rounded-full shadow-soft hover:bg-card-2 transition-all"
              >
                <Bell size={20} className="text-ink-2" />
                {pendingInvitations > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {pendingInvitations}
                  </span>
                )}
              </button>
            </>

            {!isAuthenticated && <ThemeToggle />}
            <LanguageSwitcher />
            {isExpress && !isAuthenticated && <ResetExpressRounds />}
          </div>

          {/* Acceso / Perfil */}
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={onShowAuth}
              title={t('common.signIn')}
              aria-label={t('common.signIn')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-on-accent shadow-soft transition-all hover:bg-accent-hover active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              <LogIn size={22} aria-hidden="true" />
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-right">
                <p className="text-xs font-bold capitalize text-ink">{planType}</p>
                <p className="text-xs text-ink-3">HCP {profile?.exact_handicap ?? 0}</p>
              </div>
              <button
                onClick={onShowProfile}
                title={t('common.profile')}
                aria-label={t('common.openProfile')}
                className="flex items-center justify-center w-11 h-11 bg-card border border-line rounded-full shadow-soft hover:bg-card-2 transition-all"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-9 h-9 rounded-full" />
                ) : (
                  <User size={21} className="text-ink-2" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="mb-3">
            <img src="/images/Omiki_VerdeAmarillo_Trans.png" alt="OMIKI Golf" width={4020} height={1564} className="mx-auto h-auto w-72 max-w-full object-contain" />
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
            {isExpress ? t('home.createExpress') : t('home.createGame')}
          </WriteButton>

          <WriteButton
            onClick={onJoinQuickPlay}
            className="w-full flex items-center justify-center gap-3 bg-card text-accent-ink border-2 border-accent px-6 py-4 rounded-2xl hover:bg-accent-soft transition-all font-semibold text-lg active:scale-[0.98]"
          >
            <LogIn className="w-6 h-6" />
            {t('home.joinGame')}
          </WriteButton>


          {isTeam && (
            <WriteButton
              onClick={onCreateTeam}
              className="w-full flex items-center justify-center gap-3 bg-amber-500 text-white px-6 py-4 rounded-2xl hover:bg-amber-600 transition-all font-semibold text-lg shadow-card active:scale-[0.98]"
            >
              <Plus className="w-6 h-6" />
              {t('home.createTeam')}
            </WriteButton>
          )}
        </div>

        <img src="/images/Omiki_O_VerdeAmarillo_Trans.png" alt="" aria-hidden="true" className="mx-auto h-auto w-28 object-contain" />

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
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
          <p className="text-center text-xs text-ink-4 mt-2">
            {t('home.preview', { user: profile?.nick || t('common.user'), plan: planType })}
          </p>
        )}

      </div>
    </div>
  );
};
