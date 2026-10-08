import React, { useState } from 'react';
import { Check, Circle, Crown, Gem, LogIn, User, Users, X, Zap } from 'lucide-react';
import { PlanType } from '../types';
import { annualPlanPrice, planCatalog, DisplayPlan } from '../data/planCatalog';
import { type BillingPeriod, type PaidPlan } from '../utils/playerRegistration';
import { ThemeToggle } from './ThemeToggle';

interface PlansComparisonProps {
  onBack: () => void;
  backDestination?: 'back' | 'home';
  onSelectPlan: (plan: PlanType) => void;
  onShowAuth?: () => void;
  onRegisterPlan?: (plan: PaidPlan, period: BillingPeriod) => void;
  currentPlan?: PlanType;
  onStartTeamTrial?: () => Promise<void>;
  expressLimit?: boolean;
}

const styles = {
  express: { ink: 'text-sky-700 dark:text-sky-400', border: 'border-sky-500', button: 'bg-sky-500 hover:bg-sky-400 text-slate-950', icon: Zap },
  player: { ink: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-500', button: 'bg-emerald-400 hover:bg-emerald-300 text-slate-950', icon: User },
  team: { ink: 'text-amber-700 dark:text-amber-400', border: 'border-amber-500', button: 'bg-amber-400 hover:bg-amber-300 text-slate-950', icon: Users },
  premium: { ink: 'text-purple-700 dark:text-purple-400', border: 'border-purple-500', button: 'bg-purple-600 hover:bg-purple-500 text-white', icon: Gem },
};
const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const planRank: Record<PlanType, number> = { express: 0, player: 1, team: 2, premium: 3 };

export const PlansComparison: React.FC<PlansComparisonProps> = ({ onBack, onSelectPlan, onShowAuth, onRegisterPlan, currentPlan, onStartTeamTrial, expressLimit = false }) => {
  const [selected, setSelected] = useState<DisplayPlan>(expressLimit ? 'player' : (currentPlan ?? 'express'));
  const [annual, setAnnual] = useState(true);
  const [comingSoon, setComingSoon] = useState(false);
  const [confirmPlayer, setConfirmPlayer] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const plan = planCatalog.find(item => item.id === selected)!;
  const style = styles[selected];
  const isCurrentPlan = currentPlan === selected;
  const isTeamTrial = currentPlan === 'player' && selected === 'team' && !!onStartTeamTrial;
  const visiblePlans = expressLimit ? planCatalog.filter(item => item.id === 'player') : planCatalog;

  return (
    <main className="min-h-screen bg-app px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-md rounded-[2rem] border border-line bg-card p-5 shadow-card sm:p-6">
        <div className="mb-2 flex items-center justify-between">
          <ThemeToggle />
          <button type="button" onClick={onBack} aria-label="Cerrar planes" className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-3 hover:bg-card-2"><X size={20} /></button>
        </div>
        <header className="text-center">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-ink">{expressLimit ? 'Límite Express alcanzado' : 'Mejora tu juego'}</span>
          <h1 className="mt-3 text-2xl font-bold leading-tight text-ink">{expressLimit ? 'Ya has utilizado tus 4 partidas Express' : 'Lleva tu golf al siguiente nivel'}</h1>
          <p className="mt-2 text-xs leading-relaxed text-ink-3">{expressLimit ? 'Pasa a Omiki Player para seguir creando partidas sin límite y conservar tu historial en la nube.' : 'Guarda tus partidas de por vida, analiza tus estadísticas avanzadas y únete a ligas permanentes.'}</p>
        </header>
        <div className="mx-auto mb-5 mt-6 flex max-w-xs rounded-full border border-line bg-card-2 p-1" role="group" aria-label="Periodicidad del plan">
          {[false, true].map(value => (
            <button key={String(value)} type="button" aria-pressed={annual === value} onClick={() => { setAnnual(value); setComingSoon(false); }} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${annual === value ? 'bg-accent text-on-accent' : 'text-ink-3 hover:text-ink'}`}>
              {value ? 'Anual' : 'Mensual'}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {visiblePlans.map(item => {
            const current = styles[item.id];
            const Icon = current.icon;
            const active = selected === item.id;
            const isCurrent = currentPlan === item.id;
            const isIncluded = currentPlan !== undefined && planRank[item.id] < planRank[currentPlan];
            return (
              <button key={item.id} id={`plan-${item.id}`} type="button" disabled={isCurrent || isIncluded} aria-expanded={active} aria-controls="plan-details" onClick={() => { setSelected(item.id); setComingSoon(false); }} className={`w-full rounded-2xl border bg-card-2 p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-not-allowed ${isIncluded ? 'border-line opacity-55' : active ? current.border : 'border-line hover:border-line-2'}`}>
                <div className="flex items-center gap-2">
                  <Icon size={20} className={`shrink-0 ${current.ink}`} />
                  <div className="min-w-0 flex-1">
                    <h2 className={`text-xs font-bold uppercase ${current.ink}`}>Omiki {item.name}</h2>
                    <p className="text-[11px] text-ink-3">{item.subtitle}</p>
                  </div>
                  {isCurrent ? <span className={`text-[10px] font-bold uppercase ${current.ink}`}>Plan actual</span> : isIncluded ? <span className="text-[10px] font-bold uppercase text-ink-4">Incluido</span> : active ? <Check size={18} className={current.ink} /> : <Circle size={16} className="text-ink-4" />}
                </div>
                <p className="mt-2 font-bold text-ink">{item.monthly === 0 ? '0 €' : money.format(annual ? annualPlanPrice(item.monthly) : item.monthly)}<span className="ml-1 text-xs font-normal text-ink-3">{item.monthly === 0 ? 'Sin registro' : annual ? '/año' : '/mes'}</span></p>
              </button>
            );
          })}
        </div>
        {annual && <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-3">Ahorra aproximadamente un 20 % frente al pago mensual.</p>}
        <section id="plan-details" role="region" aria-labelledby={`plan-${selected}`} className="mt-4 rounded-2xl border border-line bg-card-2 p-4">
          <h3 className={`flex items-center gap-2 text-xs font-bold uppercase ${style.ink}`}><Crown size={15} className="shrink-0" />{plan.heading}</h3>
          <ul className="mt-3 space-y-2.5">
            {plan.features.map(feature => <li key={feature} className="flex items-start gap-2 text-xs leading-relaxed text-ink-2"><Check size={15} className={`mt-0.5 shrink-0 ${style.ink}`} /><span>{feature}</span></li>)}
          </ul>
        </section>
        <button type="button" disabled={isCurrentPlan || updating} onClick={() => {
          setUpdateError('');
          if (isCurrentPlan) return;
          if (selected === 'express') onSelectPlan('express');
          else if (isTeamTrial || !currentPlan) setConfirmPlayer(true);
          else setComingSoon(true);
        }} className={`mt-4 w-full rounded-xl px-4 py-3.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${style.button}`}>{isCurrentPlan ? 'Plan actual' : isTeamTrial ? 'Probar Team durante 30 días' : plan.action}</button>
        {comingSoon && <p role="status" className="mt-3 rounded-xl bg-accent-soft p-3 text-center text-sm font-semibold text-accent-ink">Próximamente</p>}
        {updateError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">{updateError}</p>}
        {!expressLimit && onShowAuth && <button type="button" onClick={onShowAuth} className="mt-6 flex w-full items-center justify-center gap-2 border-t border-line pt-5 text-sm text-ink-2 hover:text-accent-ink"><LogIn size={18} className="shrink-0" /><span>¿Ya estás registrado? <span className="font-semibold underline">Inicia sesión</span></span></button>}
      </div>
      {confirmPlayer && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="player-choice-title" onKeyDown={event => { if (event.key === 'Escape') setConfirmPlayer(false); }}>
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-card">
          <h2 id="player-choice-title" className="font-bold text-ink">{isTeamTrial ? 'Probar Team durante 30 días' : `Has elegido el plan ${plan.name}`}</h2>
          <p className="mt-2 text-sm text-ink-3">{isTeamTrial ? 'La prueba se activará ahora y conservarás tu plan Player original.' : 'Vamos a crear tu cuenta. Necesitamos algunos datos para configurar tu perfil.'}</p>
          <div className="mt-5 flex gap-3">
            <button autoFocus type="button" onClick={() => setConfirmPlayer(false)} className="flex-1 rounded-xl bg-card-2 px-4 py-3 font-semibold text-ink">Cancelar</button>
            <button type="button" disabled={updating} onClick={async () => {
              if (selected === 'express') return;
              if (isTeamTrial && onStartTeamTrial) {
                setUpdating(true);
                setUpdateError('');
                try {
                  await onStartTeamTrial();
                  setConfirmPlayer(false);
                } catch (error) {
                  setConfirmPlayer(false);
                  setUpdateError(error instanceof Error ? error.message : 'No se ha podido activar la prueba Team.');
                } finally {
                  setUpdating(false);
                }
                return;
              }
              setConfirmPlayer(false);
              onRegisterPlan?.(selected, annual ? 'annual' : 'monthly');
            }} className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-60">{updating ? 'Activando…' : 'Continuar'}</button>
          </div>
        </div>
      </div>}
    </main>
  );
};
