import { useEffect, useRef, useState } from 'react';
import { intentPlan } from '../utils/playerRegistration';
import { CheckCircle2, FlaskConical } from 'lucide-react';
import { playerCheckoutService } from '../services/playerCheckoutService';
import { annualPlanPrice, planCatalog } from '../data/planCatalog';
import { NavigationButton } from './NavigationButton';
import { ThemeToggle } from './ThemeToggle';

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
  const [state, setState] = useState<CheckoutState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let live = true;
    const returned = checkoutReturn === 'success';
    const load = returned ? service.refresh(userId) : service.load(userId);
    load.then(value => { if (live) { setState(value); setError(''); } }).catch(cause => { if (live) setError(cause.message); });
    // The webhook can arrive after the browser returns. Poll only the database.
    const timer = returned ? window.setInterval(() => {
      service.load(userId).then(value => { if (live) { setState(value); if (value.completed) { setError(''); window.clearInterval(timer); } } }).catch(() => {});
    }, 2500) : undefined;
    const stop = window.setTimeout(() => window.clearInterval(timer), 60000);
    return () => { live = false; mounted.current = false; window.clearInterval(timer); window.clearTimeout(stop); };
  }, [userId, service, checkoutReturn]);
  const run = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'No se ha podido completar. Reintenta.'); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const plan = planCatalog.find(plan => plan.id === (state ? intentPlan(state.intent) : 'player'))!;
  const price = plan.monthly;
  const annual = state?.intent.period === 'annual';
  const amount = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(annual ? annualPlanPrice(price) : price);
  return <main className="min-h-screen bg-app px-4 py-6">
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex items-center justify-between"><NavigationButton destination="home" onClick={onBack} /><ThemeToggle /></div>
      <div className="rounded-2xl border border-line bg-card p-6 shadow-card">
        <p className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-amber-100 p-3 text-center text-sm font-semibold text-amber-900"><FlaskConical size={18} className="shrink-0" />Stripe Sandbox · Pago de prueba</p>
        <h1 className="text-center text-2xl font-bold text-ink">{state?.completed ? `¡${plan.name} activado!` : `Activar Omiki ${plan.name}`}</h1>
        {!state && !error && <p role="status" className="mt-4 text-center text-ink-3">Recuperando tu registro…</p>}
        {state && <>
          {state.completed && <CheckCircle2 size={48} className="mx-auto mt-5 text-accent-ink" />}
          <div className="my-6 rounded-xl border border-line bg-card-2 p-5">
            <div className="flex items-center gap-3">
              <img src={state.profile.avatar_url || '/images/Omiki_O_VerdeAmarillo_Trans.png'} alt="Avatar del jugador" className="h-14 w-14 shrink-0 rounded-full object-contain" />
              <div className="min-w-0"><p className="break-words font-bold text-ink">{state.profile.nick}</p><p className="text-sm text-ink-3">HCP {state.profile.exact_handicap ?? 0}</p></div>
            </div>
            <p className="mt-4 font-bold text-accent-ink">{plan.name} {state.completed ? '· Activo' : '· Pendiente de activación'}</p>
            <p className="mt-1 text-sm text-ink-2">{annual ? 'Anual' : 'Mensual'} · {amount}{annual ? '/año' : '/mes'}</p>
          </div>
          <p className="mb-5 text-center text-sm text-ink-3">{state.completed ? 'Stripe ha confirmado el pago de prueba. No se ha realizado ningún cobro real.' : `Tu correo está confirmado. Continúa a Stripe para activar ${plan.name} con una tarjeta de prueba.`}</p>
          {!state.completed && <p className="mb-4 text-center text-sm text-ink-3">Tarjeta de prueba: 4242 4242 4242 4242. Usa una fecha futura y cualquier CVC de 3 cifras.</p>}
          {checkoutReturn === 'cancelled' &&!state.completed && <p role="status" className="mb-4 text-sm text-ink-3">Has vuelto sin completar el pago. Puedes retomarlo.</p>}
          {state.readOnly && <p className="mb-4 text-sm text-ink-3">Esta cuenta tiene permisos de solo lectura.</p>}
          {!state.completed && state.existingPaidPlan && <p className="mb-4 text-sm text-ink-3">La cuenta ya tiene una suscripción. Comprueba su estado antes de continuar.</p>}
          <button type="button" disabled={busy || (!state.completed && (state.readOnly || state.existingPaidPlan))} onClick={() => void run(async () => {
            if (state.completed) { await service.acknowledge(userId); await onDone(); }
            else { const result = await service.activate(userId); if (mounted.current) setState(result); }
          })} className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50">{busy ? 'Procesando…' : state.completed ? 'Comenzar a jugar' : 'Continuar a Stripe'}</button>
          {!state.completed && <button type="button" disabled={busy} onClick={() => void run(async () => { const value = await service.refresh(userId); if (mounted.current) setState(value); })} className="mt-3 w-full text-sm font-semibold text-accent-ink underline">Comprobar pago</button>}
        </>}
        {error && <div className="mt-4"><p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p><button type="button" disabled={busy} onClick={() => void run(async () => { const value = await service.refresh(userId); if (mounted.current) setState(value); })} className="mt-3 w-full text-sm font-semibold text-accent-ink underline">Reintentar comprobación</button></div>}
      </div>
    </div>
  </main>;
}
