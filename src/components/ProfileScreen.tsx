import { NavigationButton } from './NavigationButton';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import React from 'react';
import { Settings, BarChart3, Gamepad2, Crown, ChevronRight, CreditCard, Gem, LogOut } from 'lucide-react';
import { UserProfile, PlanType } from '../types';
import { useTranslation } from 'react-i18next';

interface ProfileScreenProps {
  profile: UserProfile | null;
  planType: PlanType;
  onBack: () => void;
  onLogout: () => void;
  onShowRoundStats: () => void;
  onShowCareerStats: () => void;
  onShowPlans: () => void;
  onShowProShop: () => void;
  onShowGroups: () => void;
  onShowSettings: () => void;
  messagesButton?: React.ReactNode;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  planType,
  onBack,
  onLogout,
  onShowRoundStats,
  onShowCareerStats,
  onShowPlans,
  onShowProShop,
  onShowGroups,
  onShowSettings,
  messagesButton,
}) => {
  const { t } = useTranslation();
  const isTeam = (planType === 'team' || planType === 'premium');
  const avatarPlanClasses: Record<PlanType, string> = {
    express: 'border-blue-500 bg-blue-500',
    player: 'border-emerald-500 bg-emerald-500',
    team: 'border-orange-500 bg-orange-500',
    premium: 'border-purple-500 bg-purple-500',
  };

  // Mis partidas: estadísticas de cada partida. Mis estadísticas: acumuladas de todas.
  const menuItems = [
    { icon: Gamepad2, label: t('profile.rounds'), onClick: onShowRoundStats, show: true, comingSoon: false },
    { icon: BarChart3, label: t('profile.stats'), onClick: onShowCareerStats, show: true, comingSoon: false },
    { icon: Settings, label: t('profile.details'), onClick: onShowSettings, show: true },
    { icon: Gem, label: t('profile.plans'), onClick: onShowPlans, show: true },
    { icon: Crown, label: t('profile.groups'), onClick: onShowGroups, show: isTeam },
    { icon: CreditCard, label: 'Pro-Shop', onClick: onShowProShop, show: isTeam },
  ];

  return (
    <div className="min-h-screen bg-app transition-colors">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div>
            <NavigationButton destination="home" onClick={onBack} />
          </div>
          <div className="flex justify-center">{messagesButton}</div>
          <div />
        </div>

        {/* Profile header */}
        <div className="bg-card rounded-2xl shadow-card p-6 mb-5">
          <div className="flex items-center gap-4">
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] ${avatarPlanClasses[planType]}`}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="h-14 w-14 rounded-full bg-white object-cover ring-1 ring-white/80" />
              ) : (
                <Settings className="text-white" size={24} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-xl font-bold text-ink">{profile?.nick || t('profile.player')}</h2>
              <p className="break-words text-sm text-ink-3">{profile?.display_name || ''}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${isTeam ? 'bg-amber-100 text-amber-700' : 'bg-accent-soft text-accent-ink'}`}>
                  {planType}
                </span>
                {profile?.exact_handicap !== undefined && (
                  <span className="text-xs text-ink-3">HCP {profile.exact_handicap}</span>
                )}
                {isTeam && <Crown className="text-amber-500" size={16} aria-hidden="true" />}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle className="!h-11 !w-11" />
              <LanguageSwitcher />
            </div>
          </div>
        </div>

        {/* Menu items */}
        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          {menuItems.filter(m => m.show).map((item, i) => (
            <button
              key={item.label}
              onClick={item.onClick}
              disabled={item.comingSoon}
              className={`w-full flex items-center gap-3 px-5 py-4 transition-colors enabled:hover:bg-card-2 disabled:cursor-not-allowed ${i > 0 ? 'border-t border-line' : ''}`}
            >
              <item.icon size={20} className={item.comingSoon ? 'text-ink-4' : 'text-ink-3'} />
              <span className={`flex-1 text-left font-medium ${item.comingSoon ? 'text-ink-4' : 'text-ink'}`}>{item.label}</span>
              {item.comingSoon
                ? <span className="rounded-full bg-card-2 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-3">Próximamente</span>
                : <ChevronRight size={18} className="text-ink-4" />}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-600 shadow-soft transition-all hover:bg-red-100 hover:text-red-700 active:scale-[0.98]"
        >
          <LogOut size={20} aria-hidden="true" />
          {t('common.logout')}
        </button>
      </div>
    </div>
  );
};
