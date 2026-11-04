import { NavigationButton } from './NavigationButton';
import React, { useEffect, useState } from 'react';
import { Settings, BarChart3, LandPlot, Crown, ChevronRight, CreditCard, Gem, Info, LogOut, X } from 'lucide-react';
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
  /** La cuenta pertenece a algún grupo (aunque su plan no permita crear uno). */
  hasGroups?: boolean;
  onShowSettings: () => void;
  messagesButton?: React.ReactNode;
  handicap9?: number;
  handicap18?: number;
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
  hasGroups = false,
  onShowSettings,
  messagesButton,
  handicap9: propHandicap9,
  handicap18: propHandicap18,
}) => {
  const { t } = useTranslation();
  const [showHandicapInfo, setShowHandicapInfo] = useState(false);
  const isTeam = (planType === 'team' || planType === 'premium');
  const nick = profile?.nick || t('profile.player');
  const nickSize = nick.length > 20 ? 'text-xs' : nick.length > 15 ? 'text-base' : 'text-xl';
  const fallbackHandicap18 = profile?.exact_handicap;
  const handicap18 = propHandicap18 !== undefined ? propHandicap18 : fallbackHandicap18;
  const handicap9 = propHandicap9 !== undefined ? propHandicap9 : (handicap18 === undefined ? undefined : Math.round(handicap18 / 2));
  const avatarPlanClasses: Record<PlanType, string> = {
    express: 'border-blue-500 bg-blue-500',
    player: 'border-emerald-500 bg-emerald-500',
    team: 'border-orange-500 bg-orange-500',
    premium: 'border-purple-500 bg-purple-500',
  };

  // Mis partidas: estadísticas de cada partida. Mis estadísticas: acumuladas de todas.
  // Primer bloque: lo personal del jugador. Segundo bloque, tras el separador: tienda y planes.
  const menuSections = [
    [
      { icon: LandPlot, label: t('profile.rounds'), onClick: onShowRoundStats, show: true, comingSoon: false },
      { icon: BarChart3, label: t('profile.stats'), onClick: onShowCareerStats, show: true, comingSoon: false },
      { icon: Crown, label: t('profile.groups'), onClick: onShowGroups, show: isTeam || hasGroups },
      { icon: Settings, label: t('profile.details'), onClick: onShowSettings, show: true },
    ],
    [
      { icon: CreditCard, label: 'Pro-Shop', onClick: onShowProShop, show: isTeam },
      { icon: Gem, label: t('profile.plans'), onClick: onShowPlans, show: true },
    ],
  ].map((section) => section.filter((item) => item.show)).filter((section) => section.length > 0);

  useEffect(() => {
    if (!showHandicapInfo) return;
    window.history.pushState({ ...(window.history.state || {}), omikiHandicapInfo: true }, '', window.location.href);
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.history.back();
    };
    const closeOnBack = () => setShowHandicapInfo(false);
    window.addEventListener('keydown', closeOnKey);
    window.addEventListener('popstate', closeOnBack);
    return () => {
      window.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('popstate', closeOnBack);
    };
  }, [showHandicapInfo]);

  const closeHandicapInfo = () => {
    if (window.history.state?.omikiHandicapInfo) window.history.back();
    else setShowHandicapInfo(false);
  };

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
        <div className="bg-card rounded-2xl shadow-card p-5 sm:p-6 mb-5">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              {/* Avatar + Tipo de jugador (plan) debajo */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] ${avatarPlanClasses[planType]}`}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="avatar" className="h-14 w-14 rounded-full bg-white object-cover ring-1 ring-white/80" />
                  ) : (
                    <Settings className="text-white" size={24} />
                  )}
                </div>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${isTeam ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' : 'bg-accent-soft text-accent-ink'}`}>
                  {isTeam && <Crown size={11} fill="currentColor" aria-hidden="true" />}
                  {planType}
                </span>
              </div>

              {/* Nombre y Nick del jugador */}
              <div className="min-w-0 flex-1">
                <h2 className={`whitespace-nowrap font-bold leading-tight text-ink ${nickSize}`}>{nick}</h2>
                {profile?.display_name && (
                  <p className="break-words text-sm text-ink-3 mt-0.5">{profile.display_name}</p>
                )}
              </div>
            </div>

            {/* Hándicap en números grandes a la derecha */}
            {handicap18 !== undefined && (
              <div
                className="shrink-0 text-right pl-3 sm:pl-4 border-l border-line flex flex-col items-end justify-center"
                aria-label={`HCP 18: ${handicap18}, HCP 9: ${handicap9}`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3">HCP</span>
                  <button
                    type="button"
                    onClick={() => setShowHandicapInfo(true)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-accent-ink hover:bg-accent-soft transition-colors"
                    aria-label={t('profile.handicapInfo')}
                    title={t('profile.handicapInfo')}
                  >
                    <Info size={13} aria-hidden="true" />
                  </button>
                </div>
                <p className="text-2xl sm:text-3xl font-black text-ink leading-tight mt-0.5 tracking-tight">
                  <span className="text-amber-700 dark:text-amber-400">{handicap9}</span>
                  <span className="text-ink-4 text-xl sm:text-2xl font-light mx-0.5 sm:mx-1">/</span>
                  <span className="text-accent-ink">{handicap18}</span>
                </p>
                <span className="sr-only">HCP 18: {handicap18}</span>
                <p className="text-[10px] text-ink-3 font-semibold uppercase tracking-wider">
                  9h <span className="text-ink-4">/</span> 18h
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Menu items */}
        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          {menuSections.map((section, sectionIndex) => (
            <React.Fragment key={sectionIndex}>
              {sectionIndex > 0 && <div role="separator" className="h-2 border-y border-line bg-app" />}
              {section.map((item, i) => (
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
            </React.Fragment>
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
      {showHandicapInfo && handicap18 !== undefined && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHandicapInfo(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="handicap-info-title" className="w-full max-w-sm rounded-2xl border border-line bg-card p-5 text-ink shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 id="handicap-info-title" className="text-lg font-bold">{t('profile.handicapTitle')}</h2>
              <button type="button" onClick={closeHandicapInfo} className="rounded-full p-2 text-ink-3 hover:bg-card-2" aria-label={t('common.close')}><X size={20} /></button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-card-2 p-3"><dt className="text-xs text-ink-3">{t('profile.handicap18')}</dt><dd className="mt-1 text-xl font-bold">{handicap18}</dd></div>
              <div className="rounded-xl bg-card-2 p-3"><dt className="text-xs text-ink-3">{t('profile.handicap9')}</dt><dd className="mt-1 text-xl font-bold">{handicap9}</dd></div>
            </dl>
            <p className="mt-3 text-sm text-ink-3">{t('profile.handicapHelp')}</p>
          </section>
        </div>
      )}
    </div>
  );
};
