import React, { useState } from 'react';
import { Check, Circle, Crown, Gem, LogIn, Plane, User, Users, X, Zap } from 'lucide-react';
import { PlanType } from '../types';
import { planCatalog, planPrice, DisplayPlan } from '../data/planCatalog';
import { type BillingPeriod, type PaidPlan } from '../utils/playerRegistration';
import { ThemeToggle } from './ThemeToggle';
import { useTranslation } from 'react-i18next';
import { useDisplayCurrency } from './CurrencySelector';
import { formatDisplayPrice } from '../utils/currency';
import { tierColors } from '../utils/tierColors';

interface PlansComparisonProps {
  onBack: () => void;
  backDestination?: 'back' | 'home';
  onSelectPlan: (plan: PlanType) => void;
  onShowAuth?: () => void;
  onRegisterPlan?: (plan: PaidPlan, period: BillingPeriod) => Promise<void> | void;
  currentPlan?: PlanType;
  currentBillingPeriod?: BillingPeriod;
  currentPeriodEnd?: string | null;
  teamTrialUsed?: boolean;
  onStartTeamTrial?: () => Promise<void>;
  onStartWeekend?: (days: 7 | 90) => Promise<void>;
  /** Plan marcado al abrir (por ejemplo Team desde el aviso de fin de Weekend). */
  initialPlan?: DisplayPlan;
  /** Mensual o anual al abrir (por ejemplo, desde un enlace de la web pública). */
  initialAnnual?: boolean;
  expressLimit?: boolean;
  /** Express que intenta usar una modalidad bloqueada: solo Express (actual) y Player, sin inicio de sesión. */
  expressModes?: boolean;
}

const styles = {
  express: { ...tierColors.express, icon: Zap },
  player: { ...tierColors.player, icon: User },
  team: { ...tierColors.team, icon: Users },
  premium: { ...tierColors.premium, icon: Gem },
  weekend: { ...tierColors.weekend, icon: Plane },
};
// Weekend es un pago puntual: nunca se considera "incluido" en otro plan.
const planRank: Record<DisplayPlan, number> = { express: 0, player: 1, team: 2, premium: 3, weekend: 99 };

export const PlansComparison: React.FC<PlansComparisonProps> = ({ onBack, onSelectPlan, onShowAuth: showAuth, onRegisterPlan, currentPlan: planInUse, currentBillingPeriod, currentPeriodEnd, teamTrialUsed = false, onStartTeamTrial, onStartWeekend, expressLimit = false, expressModes = false, initialPlan, initialAnnual }) => {
  const { t, i18n } = useTranslation();
  const currency = useDisplayCurrency();
  const money = (value: number) => formatDisplayPrice(value, currency, i18n.resolvedLanguage);
  const p = (key: string, options?: Record<string, unknown>) => t(`plans.${key}`, options);
  // El catálogo en español es el texto por defecto si un idioma no tiene traducción.
  const catalogText = (id: DisplayPlan, field: string, fallback: string) => t(`plans.catalog.${id}.${field}`, { defaultValue: fallback });
  const longDate = new Intl.DateTimeFormat(i18n.resolvedLanguage || 'es', { day: 'numeric', month: 'long', year: 'numeric' });
  const currentPlan = expressModes ? 'express' : planInUse;
  const onShowAuth = expressModes ? undefined : showAuth;
  const [selected, setSelected] = useState<DisplayPlan>(initialPlan ?? (expressLimit || expressModes ? 'player' : (currentPlan ?? 'express')));
  const [annual, setAnnual] = useState(initialAnnual ?? (currentBillingPeriod ? currentBillingPeriod === 'annual' : true));
  const [weekendDays, setWeekendDays] = useState<7 | 90>(7);
  const [comingSoon, setComingSoon] = useState(false);
  // Weekend es un extra: solo se contrata sobre un plan de pago (Player o Team).
  const [weekendNeedsPlan, setWeekendNeedsPlan] = useState(false);
  const hasPaidPlan = currentPlan === 'player' || currentPlan === 'team' || currentPlan === 'premium';
  const [confirmPlayer, setConfirmPlayer] = useState(false);
  const [confirmingPaidUpgrade, setConfirmingPaidUpgrade] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const plan = planCatalog.find(item => item.id === selected)!;
  const style = styles[selected];
  const isCurrentPlan = currentPlan === selected;
  const isPlayerToTeam = currentPlan === 'player' && selected === 'team';
  const isPaidUpgrade = currentPlan !== undefined && selected !== 'express' && selected !== 'weekend' && planRank[selected] > planRank[currentPlan];
  const currentPlanName = planCatalog.find(item => item.id === currentPlan)?.name ?? currentPlan;
  const canStartTeamTrial = isPlayerToTeam && !!onStartTeamTrial && !teamTrialUsed;
  const visiblePlans = expressLimit
    ? planCatalog.filter(item => item.id === 'player')
    : expressModes ? planCatalog.filter(item => item.id === 'express' || item.id === 'player') : planCatalog;

  return (
    <main className="min-h-screen bg-app px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-md rounded-[2rem] border border-line bg-card p-5 shadow-card sm:p-6">
        <div className="mb-2 flex items-center justify-between">
          <ThemeToggle />
          <button type="button" onClick={onBack} aria-label={p('close')} className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-3 hover:bg-card-2"><X size={20} /></button>
        </div>
        <header className="text-center">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-ink">{expressLimit ? p('limitBadge') : p('badge')}</span>
          <h1 className="mt-3 text-2xl font-bold leading-tight text-ink">{expressLimit ? p('limitTitle') : p('title')}</h1>
          <p className="mt-2 text-xs leading-relaxed text-ink-3">{expressLimit ? p('limitSubtitle') : expressModes ? p('modesSubtitle') : p('subtitle')}</p>
        </header>
        <div className="mx-auto mb-5 mt-6 flex max-w-xs rounded-full border border-line bg-card-2 p-1" role="group" aria-label={p('period')}>
          {[false, true].map(value => (
            <button key={String(value)} type="button" aria-pressed={annual === value} onClick={() => { setAnnual(value); setComingSoon(false); }} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${annual === value ? 'bg-accent text-on-accent' : 'text-ink-3 hover:text-ink'}`}>
              {value ? p('annual') : p('monthly')}
            </button>
          ))}
        </div>
        {/* La moneda se elige en Mis datos de registro, junto al idioma y el tema. */}
        {currency === 'GBP' && <p className="mb-5 text-center text-[10px] leading-relaxed text-ink-3">{t('currency.adaptive')}</p>}
        <div className="space-y-2">
          {visiblePlans.map(item => {
            const current = styles[item.id];
            const Icon = current.icon;
            const active = selected === item.id;
            const isCurrent = currentPlan === item.id;
            const isIncluded = currentPlan !== undefined && planRank[item.id] < planRank[currentPlan];
            return (
              <button key={item.id} id={`plan-${item.id}`} type="button" disabled={isCurrent || isIncluded} aria-expanded={active} aria-controls="plan-details" onClick={() => { setSelected(item.id); setComingSoon(false); setWeekendNeedsPlan(false); }} className={`w-full rounded-2xl border bg-card-2 p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-not-allowed ${isIncluded ? 'border-line opacity-55' : active ? current.border : 'border-line hover:border-line-2'}`}>
                <div className="flex items-center gap-2">
                  <Icon size={20} className={`shrink-0 ${current.ink}`} />
                  <div className="min-w-0 flex-1">
                    <h2 className={`text-xs font-bold uppercase ${current.ink}`}>Omiki {item.name}</h2>
                    <p className="text-[11px] text-ink-3">{catalogText(item.id, 'subtitle', item.subtitle)}</p>
                  </div>
                  {isCurrent ? <span className={`text-[10px] font-bold uppercase ${current.ink}`}>{p('current')}</span> : isIncluded ? <span className="text-[10px] font-bold uppercase text-ink-4">{p('included')}</span> : active ? <Check size={18} className={current.ink} /> : <Circle size={16} className="text-ink-4" />}
                </div>
                {'oneOff' in item ? (
                  <p className="mt-2 font-bold text-ink">{p('from', { price: money(item.oneOff[0].price) })}<span className="ml-1 text-xs font-normal text-ink-3">{p('oneOff')} · {p('vatIncluded')}</span></p>
                ) : (
                  <p className="mt-2 font-bold text-ink">{item.monthly === 0 ? p('free') : money(planPrice(item, annual))}<span className="ml-1 text-xs font-normal text-ink-3">{item.monthly === 0 ? p('noSignup') : `${annual ? p('perYear') : p('perMonth')} · ${p('vatIncluded')}`}</span></p>
                )}
                {annual && item.regularAnnual !== null && <p className="text-[11px] text-ink-4"><span className="line-through">{p('regular', { price: money(item.regularAnnual) })}</span> · {p('vatShort')}</p>}
              </button>
            );
          })}
        </div>
        {annual && <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-3">{p('save')}</p>}
        <section id="plan-details" role="region" aria-labelledby={`plan-${selected}`} className="mt-4 rounded-2xl border border-line bg-card-2 p-4">
          <h3 className={`flex items-center gap-2 text-xs font-bold uppercase ${style.ink}`}><Crown size={15} className="shrink-0" />{catalogText(plan.id, 'heading', plan.heading)}</h3>
          {'oneOff' in plan && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {plan.oneOff.map((option, index) => {
                const days = index === 0 ? 7 : 90;
                return <button type="button" key={option.label} aria-pressed={weekendDays === days} onClick={() => setWeekendDays(days)} className={`rounded-xl border bg-card p-3 text-center ${weekendDays === days ? style.border : 'border-line'}`}>
                  <p className="text-[11px] text-ink-3">{p('payFor', { label: catalogText(plan.id, `oneOff.${index}`, option.label) })}</p>
                  <p className="text-lg font-bold text-ink">{money(option.price)}</p>
                  <p className="text-[10px] text-ink-3">{p('vatShort')}</p>
                </button>;
              })}
            </div>
          )}
          <ul className="mt-3 space-y-2.5">
            {plan.features.map((feature, index) => <li key={feature.text} className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
              {feature.included ? <Check size={15} className={`mt-0.5 shrink-0 ${style.ink}`} /> : <X size={15} className="mt-0.5 shrink-0 text-ink-4" />}
              <span className={`${feature.included ? '' : 'text-ink-4 line-through'} ${feature.bold ? 'font-bold' : ''}`}>{catalogText(plan.id, `features.${index}`, feature.text)}</span>
            </li>)}
          </ul>
          {selected === 'weekend'
            ? <p className="mt-3 text-center text-[11px] text-ink-3">{p('oneOffNote')}</p>
            : selected !== 'express' && <p className="mt-3 text-center text-[11px] text-ink-3">{p('noCommitment')}</p>}
        </section>
        {isPlayerToTeam ? (
          // Un Player que elige Team puede probarlo 30 días o suscribirse directamente.
          <div className="mt-4 grid gap-2">
            {canStartTeamTrial && <button type="button" disabled={updating} onClick={() => { setConfirmingPaidUpgrade(false); setUpdateError(''); setComingSoon(false); setConfirmPlayer(true); }} className={`w-full rounded-xl px-4 py-3.5 text-sm font-bold transition-colors disabled:opacity-60 ${style.button}`}>
              {p('trialButton')}
            </button>}
            <button type="button" disabled={updating} onClick={() => { setConfirmingPaidUpgrade(true); setUpdateError(''); setComingSoon(false); setConfirmPlayer(true); }} className={`w-full rounded-xl border-2 ${style.border} bg-card px-4 py-3.5 text-sm font-bold ${style.ink} transition-colors hover:bg-card-2 disabled:opacity-60`}>
              {p('subscribeTeam')}
            </button>
          </div>
        ) : (
          <button type="button" disabled={isCurrentPlan || updating} onClick={() => {
            setUpdateError('');
            if (isCurrentPlan) return;
            if (selected === 'express') onSelectPlan('express');
            else if (selected === 'weekend') {
              if (!hasPaidPlan || !onStartWeekend) { setWeekendNeedsPlan(true); return; }
              setUpdating(true);
              void onStartWeekend(weekendDays).catch(error => {
                const message = error instanceof Error ? error.message : '';
                // Si el servidor rechaza por no tener plan de pago, mismo aviso con el botón Ver planes.
                if (/Player o Team/.test(message)) setWeekendNeedsPlan(true);
                else setUpdateError(message || p('errors.weekend'));
              }).finally(() => setUpdating(false));
            }
            else if (isPaidUpgrade) { setConfirmingPaidUpgrade(true); setConfirmPlayer(true); }
            else if (!currentPlan || currentPlan === 'express') setConfirmPlayer(true);
            else setComingSoon(true);
          }} className={`mt-4 w-full rounded-xl px-4 py-3.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${style.button}`}>{isCurrentPlan ? p('current') : catalogText(plan.id, 'action', plan.action)}</button>
        )}
        {weekendNeedsPlan && <div role="status" className="mt-3 rounded-xl border border-orange-500 bg-card-2 p-3 text-center">
          <p className="text-sm font-semibold text-ink">{p('weekendNeedsPlan')}</p>
          <button type="button" onClick={() => {
            setWeekendNeedsPlan(false);
            setSelected('player');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }} className="mt-3 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent">{p('seePlans')}</button>
        </div>}
        {comingSoon && <p role="status" className="mt-3 rounded-xl bg-accent-soft p-3 text-center text-sm font-semibold text-accent-ink">{p('comingSoon')}</p>}
        {updateError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">{updateError}</p>}
        {!expressLimit && onShowAuth && <button type="button" onClick={onShowAuth} className="mt-6 flex w-full items-center justify-center gap-2 border-t border-line pt-5 text-sm text-ink-2 hover:text-accent-ink"><LogIn size={18} className="shrink-0" /><span>{p('alreadyRegistered')} <span className="font-semibold underline">{p('signIn')}</span></span></button>}
      </div>
      {confirmPlayer && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="player-choice-title" onKeyDown={event => { if (event.key === 'Escape') setConfirmPlayer(false); }}>
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-card">
          <h2 id="player-choice-title" className="font-bold text-ink">{canStartTeamTrial && !confirmingPaidUpgrade ? p('trialTitle') : confirmingPaidUpgrade ? p('upgradeTitle', { from: currentPlanName, to: plan.name }) : p('chosenTitle', { plan: plan.name })}</h2>
          <p className="mt-2 text-sm text-ink-3">{canStartTeamTrial && !confirmingPaidUpgrade
            ? p('trialText', { start: longDate.format(new Date()), end: longDate.format(new Date(Date.now() + 30 * 86_400_000)) })
            : confirmingPaidUpgrade
              ? p('upgradeText', { date: currentPeriodEnd ? longDate.format(new Date(currentPeriodEnd)) : p('nextRenewal'), period: currentBillingPeriod === 'monthly' ? p('monthlyPeriod') : p('annualPeriod') })
            : p('createAccount')}</p>
          <div className="mt-5 flex gap-3">
            <button autoFocus type="button" onClick={() => setConfirmPlayer(false)} className="flex-1 rounded-xl bg-card-2 px-4 py-3 font-semibold text-ink">{p('cancel')}</button>
            <button type="button" disabled={updating} onClick={async () => {
              if (selected === 'express' || selected === 'weekend') return;
              if (canStartTeamTrial && !confirmingPaidUpgrade && onStartTeamTrial) {
                setUpdating(true);
                setUpdateError('');
                try {
                  await onStartTeamTrial();
                  setConfirmPlayer(false);
                } catch (error) {
                  setConfirmPlayer(false);
                  setUpdateError(error instanceof Error ? error.message : p('errors.trial'));
                } finally {
                  setUpdating(false);
                }
                return;
              }
              setUpdating(true);
              setUpdateError('');
              try {
                await onRegisterPlan?.(selected, currentBillingPeriod ?? (annual ? 'annual' : 'monthly'));
                setConfirmPlayer(false);
              } catch (error) {
                setConfirmPlayer(false);
                setUpdateError(error instanceof Error ? error.message : p('errors.change'));
              } finally {
                setUpdating(false);
              }
            }} className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-60">{updating ? p('activating') : p('continue')}</button>
          </div>
        </div>
      </div>}
    </main>
  );
};
