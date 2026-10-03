import { NavigationButton } from './NavigationButton';
import { ThemeToggle } from './ThemeToggle';
import React, { useState } from 'react';
import { Settings, BarChart3, Gamepad2, Crown, ChevronRight, CreditCard } from 'lucide-react';
import { UserProfile, PlanType } from '../types';
import { useTranslation } from 'react-i18next';

interface ProfileScreenProps {
  profile: UserProfile | null;
  planType: PlanType;
  onBack: () => void;
  onLogout: () => void;
  onShowStats: () => void;
  onShowHistory: () => void;
  onShowUpgrade: () => void;
  onShowProShop: () => void;
  onShowGroups: () => void;
  onShowSettings: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  planType,
  onBack,
  onLogout,
  onShowStats,
  onShowHistory,
  onShowUpgrade,
  onShowProShop,
  onShowGroups,
  onShowSettings,
}) => {
  const { t } = useTranslation();
  const isTeam = (planType === 'team' || planType === 'premium');
  const isPlayer = planType === 'player';

  const menuItems = [
    { icon: Gamepad2, label: t('profile.rounds'), onClick: onShowHistory, show: true },
    { icon: BarChart3, label: t('profile.stats'), onClick: onShowStats, show: true },
    { icon: Crown, label: t('profile.groups'), onClick: onShowGroups, show: isTeam },
    { icon: CreditCard, label: 'Pro-Shop', onClick: onShowProShop, show: isTeam },
    { icon: Settings, label: t('profile.details'), onClick: onShowSettings, show: true },
  ];

  return (
    <div className="min-h-screen bg-app transition-colors">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <NavigationButton destination="home"
            onClick={onBack}
            className="flex items-center gap-2 text-ink-3 hover:text-ink"
          />
          <NavigationButton destination="logout"
            onClick={onLogout}
            className="h-11 w-11 !rounded-full border border-red-200 bg-red-50 text-red-600 shadow-soft transition-all hover:bg-red-100 hover:text-red-700 active:scale-95"
          />
        </div>

        {/* Profile header */}
        <div className="bg-card rounded-2xl shadow-card p-6 mb-5">
          <div className="flex items-center gap-4">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-16 h-16 shrink-0 rounded-full border-2 border-accent-ring" />
            ) : (
              <div className="w-16 h-16 shrink-0 bg-accent-soft rounded-full flex items-center justify-center">
                <Settings className="text-accent-ink" size={24} />
              </div>
            )}
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
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2">
              <ThemeToggle />
              {isTeam && <Crown className="text-amber-500" size={24} />}
            </div>
          </div>
        </div>

        {/* Upgrade banner for Player */}
        {isPlayer && (
          <button
            onClick={onShowUpgrade}
            className="w-full bg-amber-100 text-amber-900 border-2 border-amber-300 rounded-2xl p-4 mb-5 shadow-card hover:bg-amber-200 transition-all text-left flex items-center justify-between"
          >
            <div>
              <p className="font-bold">{t('profile.trial')}</p>
              <p className="text-sm text-amber-800">{t('profile.trialDescription')}</p>
            </div>
            <ChevronRight size={20} />
          </button>
        )}

        {/* Menu items */}
        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          {menuItems.filter(m => m.show).map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className={`w-full flex items-center gap-3 px-5 py-4 hover:bg-card-2 transition-colors ${i > 0 ? 'border-t border-line' : ''}`}
            >
              <item.icon size={20} className="text-ink-3" />
              <span className="flex-1 text-left font-medium text-ink">{item.label}</span>
              <ChevronRight size={18} className="text-ink-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
