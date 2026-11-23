import { useEffect, useRef, useState } from 'react';
import { intentPlan } from '../utils/playerRegistration';
import { TEAM_TRIAL_OFFER_PRICE } from '../utils/teamTrialOffer';
import { CheckCircle2, FlaskConical } from 'lucide-react';
import { playerCheckoutService } from '../services/playerCheckoutService';
import { planCatalog, planPrice } from '../data/planCatalog';
import { NavigationButton } from './NavigationButton';
import { ThemeToggle } from './ThemeToggle';
import { useTranslation } from 'react-i18next';
import { CurrencySelector, useDisplayCurrency } from './CurrencySelector';
import { formatDisplayPrice } from '../utils/currency';
import { OmikiSpinner } from './OmikiSpinner';

type CheckoutState = Awaited<ReturnType<typeof playerCheckoutService.load>>;
interface Props {
  userId: string;
  /** Value of `stripe_checkout` captured by App before it cleans the URL. */
  checkoutReturn?: string | null;
  onBack: () => void;
  onDone: () => Promise<void>;
  service?: typeof playerCheckoutService;
}
export function PlayerCheckout({ userId, checkoutReturn = null, onBack, onDone, service = playerCheckoutService }: Props) {
  const { t, i18n } = useTranslation();
  const currency = useDisplayCurrency();
  const [state, setState] = useState<CheckoutState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Stripe tarda en abrirse y el webhook puede llegar segundos después de volver:
  // en ambos casos se mantiene un indicador visible en lugar de una pantalla parada.
  const [redirecting, setRedirecting] = useState(false);
  const [waiting, setWaiting] = useState(checkoutReturn === 'success');
  const [waitExpired, setWaitExpired] = useState(false);
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let live = true;
    const returned = checkoutReturn === 'success';
    setWaiting(returned); setWaitExpired(false);
    const load = returned ? service.refresh(userId) : service.load(userId);
    load.then(value => { if (live) { setState(value); setError(''); if (value.completed) setWaiting(false); } }).catch(cause => { if (live) setError(cause.message); });
    // The webhook can arrive after the browser returns. Poll only the database.
    const timer = returned ? window.setInterval(() => {
      service.load(userId).then(value => { if (live) { setState(value); if (value.completed) { setError(''); setWaiting(false); window.clearInterval(timer); } } }).catch(() => {});
    }, 2500) : undefined;
    const stop = window.setTimeout(() => { window.clearInterval(timer); if (live) { setWaiting(false); setWaitExpired(true); } }, 60000);
    return () => { live = false; mounted.current = false; window.clearInterval(timer); window.clearTimeout(stop); };
  }, [userId, service, checkoutReturn]);
  // Si el usuario vuelve atrás desde Stripe, el navegador puede restaurar esta página
  // de su caché con «Abriendo Stripe…» todavía activo.
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) setRedirecting(false); };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'No se ha podido completar. Reintenta.'); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const plan = planCatalog.find(plan => plan.id === (state ? intentPlan(state.intent) : 'player'))!;
  const annual = state?.intent.period === 'annual';
  const offer = state?.intent.offer === 'team_trial';
  const amount = formatDisplayPrice(offer ? TEAM_TRIAL_OFFER_PRICE : planPrice(plan, annual), currency, i18n.resolvedLanguage);
  return <main className="min-h-screen bg-app px-4 py-6">
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex items-center justify-between"><NavigationButton destination="home" onClick={onBack} /><ThemeToggle /></div>
      <div className="rounded-2xl border border-line bg-card p-6 shadow-card">
        <p className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-amber-100 p-3 text-center text-sm font-semibold text-amber-900"><FlaskConical size={18} className="shrink-0" />Stripe Sandbox · Pago de prueba</p>
        <h1 className="text-center text-2xl font-bold text-ink">{state?.completed ? `¡${plan.name} activado!` : state?.isUpgrade ? `Mejorar a Omiki ${plan.name}` : `Activar Omiki ${plan.name}`}</h1>
        {!state && !error && <div role="status" className="mt-6 flex flex-col items-center gap-3"><OmikiSpinner size={72} /><p className="text-sm text-ink-3">Recuperando tu registro…</p></div>}
        {state && <>
          {state.completed && <CheckCircle2 size={48} className="mx-auto mt-5 text-accent-ink" />}
          <div className="my-6 rounded-xl border border-line bg-card-2 p-5">
            <div className="flex items-center gap-3">
              <img src={state.profile.avatar_url || '/images/Omiki_O_VerdeAmarillo_Trans.png'} alt="Avatar del jugador" className="h-14 w-14 shrink-0 rounded-full object-contain" />
              <div className="min-w-0"><p className="break-words font-bold text-ink">{state.profile.nick}</p><p className="text-sm text-ink-3">PJ {state.profile.exact_handicap ?? 0}</p></div>
            </div>
            <p className="mt-4 font-bold text-accent-ink">{plan.name} {state.completed ? '· Activo' : '· Pendiente de activación'}</p>
            <p className="mt-1 text-sm text-ink-2">{annual ? 'Anual' : 'Mensual'} · {amount}{annual ? '/año' : '/mes'}{offer && ' el primer año'} · {t('plans.vatIncluded')}</p>
            {offer && <p className="mt-1 text-xs text-ink-3">Oferta fin de prueba · después {formatDisplayPrice(planPrice(plan, true), currency, i18n.resolvedLanguage)}/año · {t('plans.vatShort')}</p>}
          </div>
          {!state.completed && <div className="mb-5 space-y-2"><CurrencySelector />{currency === 'GBP' && <p className="text-center text-[10px] leading-relaxed text-ink-3">{t('currency.adaptive')}</p>}</div>}
          <p className="mb-5 text-center text-sm text-ink-3">{state.completed ? 'Stripe ha confirmado el pago de prueba. No se ha realizado ningún cobro real.' : state.isUpgrade ? (offer ? `Tu año de ${plan.name} empieza hoy. Stripe descontará lo que te quede sin usar de Player, así que pagarás ${amount} o menos.` : 'Stripe calculará la diferencia proporcional y conservará la fecha de renovación de tu plan actual.') : `Tu correo está confirmado. Continúa a Stripe para activar ${plan.name} con una tarjeta de prueba.`}</p>
          {!state.completed && !state.isUpgrade && <p className="mb-4 text-center text-sm text-ink-3">Tarjeta de prueba: 4242 4242 4242 4242. Usa una fecha futura y cualquier CVC de 3 cifras.</p>}
          {checkoutReturn === 'cancelled' &&!state.completed && <p role="status" className="mb-4 text-sm text-ink-3">Has vuelto sin completar el pago. Puedes retomarlo.</p>}
          {waiting && !state.completed && <div role="status" aria-live="polite" className="mb-5 flex flex-col items-center gap-3"><OmikiSpinner size={64} /><p className="text-center text-sm font-medium text-ink-2">Confirmando el pago con Stripe…</p></div>}
          {waitExpired && !state.completed && <p role="status" className="mb-4 rounded-xl bg-card-2 p-3 text-center text-sm text-ink-3">Stripe aún no ha confirmado el pago. Puede tardar unos minutos; pulsa «Comprobar pago» más tarde.</p>}
          {state.readOnly && <p className="mb-4 text-sm text-ink-3">Esta cuenta tiene permisos de solo lectura.</p>}
          {!state.completed && state.existingPaidPlan && <p className="mb-4 text-sm text-ink-3">La cuenta ya tiene una suscripción. Comprueba su estado antes de continuar.</p>}
          {!(waiting && !state.completed) && <button type="button" aria-busy={busy || redirecting} disabled={busy || redirecting || (!state.completed && (state.readOnly || state.existingPaidPlan))} onClick={() => void run(async () => {
            if (state.completed) { await service.acknowledge(userId); await onDone(); }
            else {
              const result = await service.activate(userId);
              if (!mounted.current) return;
              // El navegador está saliendo hacia Stripe: el botón no vuelve a activarse.
              if (result === 'redirecting') setRedirecting(true);
              else setState(result);
            }
          })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50">{(busy || redirecting) && <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />}{redirecting ? 'Abriendo Stripe…' : busy ? 'Procesando…' : state.completed ? 'Comenzar a jugar' : state.isUpgrade ? 'Confirmar mejora a Team' : 'Continuar a Stripe'}</button>}
          {!state.completed && !waiting && <button type="button" disabled={busy || redirecting} onClick={() => void run(async () => { const value = await service.refresh(userId); if (mounted.current) setState(value); })} className="mt-3 w-full text-sm font-semibold text-accent-ink underline">Comprobar pago</button>}
        </>}
        {error && <div className="mt-4"><p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p><button type="button" disabled={busy} onClick={() => void run(async () => { const value = await service.refresh(userId); if (mounted.current) setState(value); })} className="mt-3 w-full text-sm font-semibold text-accent-ink underline">Reintentar comprobación</button></div>}
      </div>
    </div>
  </main>;
}
