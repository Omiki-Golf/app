import { WriteButton } from '../context/ReadOnlyContext';
import React, { useState } from 'react';
import { Zap, LogIn, Plus, Share2, User, Users, ChevronRight, FlaskConical, Crown } from 'lucide-react';
import { PlanType, UserProfile } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { ResetExpressRounds } from './ResetExpressRounds';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { weekendExpiryShort, weekendExpiryText, weekendLastWeek } from '../utils/weekendMode';
import { weekendKindDays, type NewGroupKind } from '../utils/groupCapacity';
import { homeGroupSections } from '../utils/homeGroups';
import { groupTier, tierColors } from '../utils/tierColors';
import { RenewalNoticeCard, type RenewalNoticeAction } from './RenewalNoticeCard';
import { AdditionalGroupRenewalCard, type AdditionalGroupRenewal } from './AdditionalGroupRenewalCard';
import { showDefaultAvatarOnError } from '../utils/avatarOptions';


interface HomeScreenProps {
  planType: PlanType;
  isAuthenticated: boolean;
  profile: UserProfile | null;
  onQuickPlay: () => void;
  onJoinQuickPlay: () => void;
  onCreateTeam: () => void;
  groupShortcuts?: Array<{ id: string; name: string; access: 'owner' | 'admin' | 'member'; group_type?: string; premium_branding?: boolean; weekend_mode_until?: string | null; weekend_days?: number | null; since?: string | null }>;
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
  /** Grupos Adicionales que vencen en 15 días o menos (cada uno con su fecha). */
  additionalRenewals?: AdditionalGroupRenewal[];
  /** «Renovar» o «No renovar» un Grupo Adicional. */
  onSetAdditionalRenewal?: (slotId: string, renew: boolean) => Promise<void>;
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

type ShortcutGroup = NonNullable<HomeScreenProps['groupShortcuts']>[number];
type ShortcutLevel = 'owner' | 'admin' | 'member';

/** Tamaño según la prioridad: los creados destacan más que los administrados, y estos más que los de miembro. */
const shortcutSize: Record<ShortcutLevel, string> = {
  owner: 'h-[52px] gap-3 px-4 rounded-2xl text-base',
  admin: 'h-11 gap-2 px-2.5 rounded-xl text-sm',
  member: 'h-9 gap-1.5 px-2.5 rounded-[10px] text-[13px]',
};

/** Acceso directo a un grupo en Home. Creados y administrados van rellenos del color del nivel; los de miembro, solo con contorno. */
function GroupShortcut({ group, level, wide, expiresLabel, onOpen }: {
  group: ShortcutGroup;
  level: ShortcutLevel;
  wide?: boolean;
  expiresLabel?: string | null;
  onOpen?: (groupId: string) => void;
}) {
  const tier = groupTier(group);
  const tone = tierColors[tier];
  const style = level === 'member' ? `bg-card ${tone.outlineButton}` : `${tone.button} ${tone.border} shadow-card`;
  const crown = level === 'owner' ? 16 : 14;
  return <WriteButton
    onClick={() => onOpen?.(group.id)}
    title={group.name}
    className={`flex w-full min-w-0 items-center border-2 font-semibold transition-all active:scale-[0.98] ${shortcutSize[level]} ${style} ${wide ? 'col-span-2' : ''}`}
  >
    <Users className={`${level === 'owner' ? 'h-5 w-5' : 'h-4 w-4'} shrink-0`} aria-hidden="true" />
    <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
    {expiresLabel && <span className="shrink-0 rounded-lg bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-900">{expiresLabel}</span>}
    {level === 'owner' && <span className="relative h-5 w-7 shrink-0" title="Creador" aria-label="Creador"><Crown size={crown} fill="currentColor" className="absolute left-0 top-1" /><Crown size={crown} fill="currentColor" className="absolute right-0 top-0" /></span>}
    {level === 'admin' && <Crown size={crown} fill="currentColor" className="shrink-0" aria-label="Administrador" />}
  </WriteButton>;
}

/** En los bloques de dos columnas, un grupo solo o el último de un número impar ocupa todo el ancho. */
const isWide = (index: number, total: number) => total % 2 === 1 && index === total - 1;

/** Ficha de Inicio con su encabezado (Partidas, Tus grupos, Administras, Tus Weekends, Eres miembro). */
function HomeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-line bg-card p-3 shadow-soft">
    <h2 className="mb-2 ml-0.5 text-xs font-semibold text-ink-2">{title}</h2>
    {children}
  </section>;
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
  additionalRenewals = [],
  onSetAdditionalRenewal,
}) => {
  const { t } = useTranslation();
  const isExpress = planType === 'express';
  const isTeam = (planType === 'team' || planType === 'premium');
  // Con Weekend el botón de crear grupo usa el naranja de Weekend en Planes.
  const weekend = weekendKindDays(createGroupKind);
  const sections = homeGroupSections(groupShortcuts);
  // Los Weekend que has creado van en su propia ficha, «Tus Weekends».
  const ownedGroups = sections.owned.filter(group => groupTier(group) !== 'weekend');
  const ownedWeekends = sections.owned.filter(group => groupTier(group) === 'weekend');
  // Sin dato explícito se mantiene la regla anterior: Team/Premium sin grupo propio.
  const canCreateGroup = createGroupKind !== undefined
    ? createGroupKind !== null
    : isTeam && groupShortcuts.every(group => group.access !== 'owner');
  // Botón para crear grupo: va en «Tus Weekends» si lo que toca crear es un Weekend; si no, en «Tus grupos».
  // Sin ninguna ficha de grupos (ni grupos ni botón de crear), Partidas usa dos botones anchos, uno en cada fila.
  const hasGroupCards = groupShortcuts.length > 0 || canCreateGroup;
  const createButton = (
    <WriteButton
      onClick={onCreateTeam}
      className={`w-full flex h-11 items-center justify-center gap-2 border-2 border-dashed bg-card px-4 rounded-xl transition-all font-semibold text-sm active:scale-[0.98] ${tierColors[weekend ? 'weekend' : createGroupKind === 'premium' ? 'premium' : 'team'].outlineButton}`}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      <span className="truncate">{weekend ? t(weekend === 90 ? 'home.createWeekend90' : 'home.createWeekend7') : t(createGroupKind === 'premium' ? 'home.createPremium' : 'home.createTeam')}</span>
    </WriteButton>
  );
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
      <div className="max-w-md w-full flex flex-col">
        {/* Top bar */}
        <div className="relative mb-[26px] flex min-h-11 items-center justify-between gap-3">
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
                <p className="text-xs text-ink-3">PJ {displayHcp9}/{displayHcp18}</p>
              </div>
              <button
                onClick={onShowProfile}
                title={t('common.profile')}
                aria-label={t('common.openProfile')}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 shadow-soft transition-all max-[360px]:h-10 max-[360px]:w-10 ${profile ? avatarPlanClasses[planType] : 'border-line bg-card-2'}`}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} onError={showDefaultAvatarOnError} alt="" className="h-9 w-9 rounded-full bg-white object-cover ring-1 ring-white/80" />
                ) : (
                  <User size={21} className="text-white" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Logo */}
        <div className="text-center mb-5 sm:mb-6">
          <h1 className="mb-2">
            <img src="/images/Omiki_VerdeAmarillo_Trans_Optimizada.png" alt="OMIKI Golf" width={804} height={313} fetchPriority="high" decoding="async" className="mx-auto h-auto w-56 max-w-full object-contain" />
          </h1>
          <p className="text-ink-3">{t('home.tagline')}</p>
        </div>

        {renewal && <RenewalNoticeCard renewal={renewal} className="mb-4" />}
        {onSetAdditionalRenewal && additionalRenewals.map(item => (
          <AdditionalGroupRenewalCard key={`${item.id}:${item.expires_at}:${item.renew}`} item={item} onSetRenewal={onSetAdditionalRenewal} className="mb-4" />
        ))}

        {/* Inicio en fichas con encabezado, por este orden: Partidas, Tus grupos, Administras, Tus Weekends
            y Eres miembro. Los grupos de cada ficha van del más antiguo al más reciente. */}
        <div className="space-y-3 mb-6">
          <HomeSection title={t('home.roundsLabel')}>
            <div className={`grid gap-2 ${hasGroupCards ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <WriteButton
                onClick={onQuickPlay}
                title={t('home.createGame')}
                aria-label={t('home.createGame')}
                className="flex h-[52px] min-w-0 items-center justify-center gap-2 bg-accent text-on-accent px-3 rounded-2xl hover:bg-accent-hover transition-all font-semibold text-base shadow-card active:scale-[0.98]"
              >
                <Zap className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate">{hasGroupCards ? t('home.createGameShort') : t('home.createGame')}</span>
              </WriteButton>

              <WriteButton
                onClick={onJoinQuickPlay}
                title={t('home.joinGame')}
                aria-label={t('home.joinGame')}
                className="flex h-[52px] min-w-0 items-center justify-center gap-2 bg-card text-accent-ink border-2 border-accent px-3 rounded-2xl hover:bg-accent-soft transition-all font-semibold text-base active:scale-[0.98]"
              >
                <LogIn className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate">{hasGroupCards ? t('home.joinGameShort') : t('home.joinGame')}</span>
              </WriteButton>
            </div>
          </HomeSection>

          {(ownedGroups.length > 0 || (canCreateGroup && !weekend)) && (
            <HomeSection title={t('home.groupsOwned')}>
              <div className="space-y-2">
                {ownedGroups.map(group => <GroupShortcut key={group.id} group={group} level="owner" onOpen={onOpenGroup} />)}
                {canCreateGroup && !weekend && createButton}
              </div>
            </HomeSection>
          )}

          {sections.admin.length > 0 && (
            <HomeSection title={t('home.groupsAdmin')}>
              <div className="grid grid-cols-2 gap-2">
                {sections.admin.map((group, index) => (
                  <GroupShortcut key={group.id} group={group} level="admin" wide={isWide(index, sections.admin.length)} onOpen={onOpenGroup} />
                ))}
              </div>
            </HomeSection>
          )}

          {(ownedWeekends.length > 0 || (canCreateGroup && weekend)) && (
            <HomeSection title={t('home.groupsWeekend')}>
              <div className="space-y-2">
                {ownedWeekends.map(group => {
                  const expires = weekendExpiryShort(group.weekend_mode_until);
                  return <React.Fragment key={group.id}>
                    <GroupShortcut group={group} level="owner" onOpen={onOpenGroup} expiresLabel={expires && t('home.expires', { date: expires })} />
                    {weekendLastWeek(group.weekend_mode_until, group.weekend_days) && (
                      <WeekendGroupNotice group={group} conversion={weekendConversion} onContractTeam={onContractTeam} onConvert={onConvertWeekend} />
                    )}
                  </React.Fragment>;
                })}
                {canCreateGroup && weekend && createButton}
              </div>
            </HomeSection>
          )}

          {sections.member.length > 0 && (
            <HomeSection title={t('home.groupsMember')}>
              <div className="grid grid-cols-2 gap-2">
                {sections.member.map((group, index) => (
                  <GroupShortcut key={group.id} group={group} level="member" wide={isWide(index, sections.member.length)} onOpen={onOpenGroup} />
                ))}
              </div>
            </HomeSection>
          )}
        </div>

        {/* La «O» se centra en el hueco libre bajo las fichas: con poco contenido baja, y nunca añade scroll. */}
        <div className="flex flex-1 items-center justify-center">
          <img src="/images/Omiki_O_VerdeAmarillo_Trans_Optimizada.png" alt="" aria-hidden="true" width={280} height={342} loading="lazy" decoding="async" className="mx-auto h-auto w-[87px] object-contain" />
        </div>

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
