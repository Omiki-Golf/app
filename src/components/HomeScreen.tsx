import { WriteButton } from '../context/ReadOnlyContext';
import React, { useState } from 'react';
import { Zap, LogIn, Plus, Share2, User, Users, ChevronRight, FlaskConical, Crown } from 'lucide-react';
import { PlanType, UserProfile } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { ResetExpressRounds } from './ResetExpressRounds';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { weekendExpiryText, weekendLastWeek } from '../utils/weekendMode';
import { weekendKindDays, type NewGroupKind } from '../utils/groupCapacity';
import { groupTier, tierColors } from '../utils/tierColors';
import { RenewalNoticeCard, type RenewalNoticeAction } from './RenewalNoticeCard';

type GroupAccess = 'owner' | 'admin' | 'member';
const ROLE_ORDER: Record<GroupAccess, number> = { owner: 0, admin: 1, member: 2 };

interface HomeScreenProps {
  planType: PlanType;
  isAuthenticated: boolean;
  profile: UserProfile | null;
  onQuickPlay: () => void;
  onJoinQuickPlay: () => void;
  onCreateTeam: () => void;
  groupShortcuts?: Array<{ id: string; name: string; access: 'owner' | 'admin' | 'member'; group_type?: string; premium_branding?: boolean; weekend_mode_until?: string | null; weekend_days?: number | null }>;
  /** Abre Planes con Team marcado (aviso de fin del Weekend de 3 meses para quien no es Team). */
  onContractTeam?: () => void;
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
  /** Grupo que el usuario puede crear ahora (un Weekend aparte o el del plan/grupo adicional); null si ninguno. */
  createGroupKind?: NewGroupKind | null;
  /** Cómo puede pasar a Team un grupo Weekend de 3 meses (ver weekendConversion). */
  weekendConversion?: 'free' | 'additional' | 'full' | 'not-team';
  /** Pasa un grupo Weekend de 3 meses a Team. */
  onConvertWeekend?: (groupId: string) => Promise<void>;
  /** Aviso de vencimiento de la suscripción (15 días antes en anuales, 3 en mensuales). */
  renewal?: RenewalNoticeAction | null;
}

/**
 * Aviso bajo la pastilla de un grupo Weekend del creador.
 * - 7 días: siempre indica cuándo vence.
 * - 3 meses: en su última semana, además ofrece pasar el grupo a Team si hay hueco.
 */
function WeekendGroupNotice({ group, conversion, onContractTeam, onConvert }: {
  group: { id: string; name: string; weekend_mode_until?: string | null; weekend_days?: number | null };
  conversion: 'free' | 'additional' | 'full' | 'not-team';
  onContractTeam?: () => void;
  onConvert?: (groupId: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const expiry = weekendExpiryText(group.weekend_mode_until);
  const lastWeek = weekendLastWeek(group.weekend_mode_until, group.weekend_days);
  if (!expiry || (group.weekend_days === 90 && !lastWeek)) return null;
  const convert = async () => {
    if (!onConvert || busy) return;
    setBusy(true); setError('');
    try { await onConvert(group.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se ha podido pasar el grupo a Team.'); }
    finally { setBusy(false); setConfirming(false); }
  };
  const button = `mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${tierColors.team.button}`;
  return <div role="status" className={`-mt-1 rounded-2xl border-2 ${tierColors.weekend.border} bg-card p-3 text-center`}>
    {lastWeek && <p className="text-sm font-semibold text-ink">Te queda menos de una semana de Weekend</p>}
    <p className={`${lastWeek ? 'mt-1 text-xs' : 'text-sm'} text-ink-3`}>{group.name} vence {expiry} y se archivará.</p>
    {lastWeek && conversion === 'free' && onConvert && <>
      <p className="mt-1 text-xs text-ink-3">Pásalo a Team y mantén sus jugadores y su historial todo el año.</p>
      <button type="button" disabled={busy} onClick={() => void convert()} className={button}>{busy ? 'Pasando a Team…' : 'Pasar a Team (incluido en tu plan)'}</button>
    </>}
    {lastWeek && conversion === 'additional' && onConvert && (confirming
      ? <>
          <p className="mt-2 text-xs text-ink-2">Se contratará un Grupo Adicional (24,99 € IVA incluido, pago de prueba) para este grupo.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-2">Cancelar</button>
            <button type="button" disabled={busy} onClick={() => void convert()} className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${tierColors.team.button}`}>{busy ? 'Pasando…' : 'Confirmar'}</button>
          </div>
        </>
      : <>
          <p className="mt-1 text-xs text-ink-3">Pásalo a Team ocupando un Grupo Adicional y mantén sus jugadores y su historial.</p>
          <button type="button" onClick={() => setConfirming(true)} className={button}>Pasar a Team · Grupo Adicional</button>
        </>)}
    {lastWeek && conversion === 'full' && <p className="mt-1 text-xs text-ink-3">Ya tienes tus 3 grupos Team, así que este grupo no puede pasar a Team.</p>}
    {lastWeek && conversion === 'not-team' && onContractTeam && <>
      <p className="mt-1 text-xs text-ink-3">Con Omiki Team podrás pasar este grupo a Team y mantenerlo todo el año.</p>
      <button type="button" onClick={onContractTeam} className={button}>Contratar Team</button>
    </>}
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
  </div>;
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
  createGroupKind,
  onContractTeam,
  weekendConversion = 'not-team',
  onConvertWeekend,
  renewal,
}) => {
  const { t } = useTranslation();
  const isExpress = planType === 'express';
  const isTeam = (planType === 'team' || planType === 'premium');
  // Con Weekend el botón de crear grupo usa el naranja de Weekend en Planes.
  const weekend = weekendKindDays(createGroupKind);
  // Sin dato explícito se mantiene la regla anterior: Team/Premium sin grupo propio.
  const canCreateGroup = createGroupKind !== undefined
    ? createGroupKind !== null
    : isTeam && groupShortcuts.every(group => group.access !== 'owner');
  const fallbackHcp18 = profile?.exact_handicap !== undefined && profile?.exact_handicap !== null
    ? Math.round(profile.exact_handicap)
    : 0;
  const fallbackHcp9 = Math.round(fallbackHcp18 / 2);
  const displayHcp9 = handicap9 ?? fallbackHcp9;
  const displayHcp18 = handicap18 ?? fallbackHcp18;
  const avatarPlanClasses: Record<PlanType, string> = {
    express: tierColors.express.button,
    player: tierColors.player.button,
    team: tierColors.team.button,
    premium: tierColors.premium.button,
  };

  return (
    <div className="min-h-screen bg-app flex justify-center px-4 py-4 sm:py-8 transition-colors">
      <div className="max-w-md w-full">
        {/* Top bar */}
        <div className="relative mb-8 flex min-h-11 items-center justify-between gap-3">
          <div className="flex h-11 items-center gap-2 max-[360px]:h-10 max-[360px]:gap-1">
            <button
              type="button"
              onClick={onShowShare}
              title={t('common.share')}
              aria-label={t('common.share')}
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-card shadow-soft transition-all hover:bg-card-2 active:scale-95 max-[360px]:h-10 max-[360px]:w-10"
            >
              <Share2 size={21} className="text-ink-2" />
            </button>

            {!isAuthenticated && <ThemeToggle />}
          </div>

          <div className="absolute left-1/2 top-1/2 z-10 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center max-[360px]:h-10">
            {messagesButton}
          </div>

          {/* Acceso / Perfil */}
          {!isAuthenticated ? (
            <div className="flex h-11 items-center gap-2 max-[360px]:h-10 max-[360px]:gap-1">
              <LanguageSwitcher />
              {isExpress && <ResetExpressRounds />}
              <button
                type="button"
                onClick={onShowAuth}
                title={t('common.signIn')}
                aria-label={t('common.signIn')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-on-accent shadow-soft transition-all hover:bg-accent-hover active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current max-[360px]:h-10 max-[360px]:w-10"
              >
                <LogIn size={21} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex h-11 shrink-0 items-center gap-2 max-[360px]:h-10">
              <div className="min-w-0 text-right">
                <p className="max-w-[7rem] truncate text-xs font-bold text-ink">{profile?.nick || t('common.user')}</p>
                <p className="text-xs text-ink-3">HCP {displayHcp9}/{displayHcp18}</p>
              </div>
              <button
                onClick={onShowProfile}
                title={t('common.profile')}
                aria-label={t('common.openProfile')}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 shadow-soft transition-all max-[360px]:h-10 max-[360px]:w-10 ${profile ? avatarPlanClasses[planType] : 'border-line bg-card-2'}`}
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

        {renewal && <RenewalNoticeCard renewal={renewal} className="mb-4" />}

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
            const tier = groupTier(group);
            const tone = tierColors[tier];
            return <React.Fragment key={group.id}><WriteButton
              onClick={() => onOpenGroup?.(group.id)}
              className={`w-full flex items-center justify-center gap-3 border-2 px-6 py-4 rounded-2xl transition-all font-semibold text-lg active:scale-[0.98] ${managesGroup ? `${tone.button} ${tone.border} shadow-card` : `bg-card ${tone.outlineButton}`}`}
            >
              <Users className="w-6 h-6" aria-hidden="true" />
              <span className="min-w-0 truncate">{group.name}</span>
              {group.access === 'owner' && <span className="relative h-7 w-9 shrink-0" title="Creador" aria-label="Creador"><Crown size={20} fill="currentColor" className="absolute left-0 top-1" /><Crown size={20} fill="currentColor" className="absolute right-0 top-0" /></span>}
              {group.access === 'admin' && <Crown size={21} fill="currentColor" className="shrink-0" aria-label="Administrador" />}
            </WriteButton>
            {group.access === 'owner' && tier === 'weekend' && (
              <WeekendGroupNotice group={group} conversion={weekendConversion} onContractTeam={onContractTeam} onConvert={onConvertWeekend} />
            )}
            </React.Fragment>;
          })}

          {canCreateGroup && (
            <WriteButton
              onClick={onCreateTeam}
              className={`w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl transition-all font-semibold text-lg shadow-card active:scale-[0.98] ${tierColors[weekend ? 'weekend' : createGroupKind === 'premium' ? 'premium' : 'team'].button}`}
            >
              <Plus className="w-6 h-6" aria-hidden="true" />
              <span className="truncate">{weekend ? t(weekend === 90 ? 'home.createWeekend90' : 'home.createWeekend7') : t(createGroupKind === 'premium' ? 'home.createPremium' : 'home.createTeam')}</span>
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
