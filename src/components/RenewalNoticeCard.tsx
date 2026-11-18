import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { RenewalNotice } from '../utils/renewalNotice';

const PLAN_NAMES: Record<RenewalNotice['plan'], string> = { player: 'Player', team: 'Team', premium: 'Premium' };

export interface RenewalNoticeAction {
  notice: RenewalNotice;
  /** «Continúa con nosotros»: oculta el aviso hasta el siguiente vencimiento. */
  onContinue: () => Promise<void>;
  /** «Darse de baja»: abre la baja de Mis datos de registro. */
  onCancel: () => void;
}

/** Aviso de vencimiento de la suscripción: 15 días antes en las anuales y 3 en las mensuales. */
export function RenewalNoticeCard({ renewal, className = '' }: { renewal: RenewalNoticeAction; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { notice } = renewal;
  const date = new Date(notice.endsAt).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' });
  const when = notice.daysLeft === 0 ? 'hoy' : notice.daysLeft === 1 ? 'mañana' : `en ${notice.daysLeft} días`;

  const keep = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await renewal.onContinue(); }
    catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : 'No se ha podido guardar. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };

  return (
    <section role="status" className={`rounded-2xl border border-line bg-card p-4 text-ink shadow-card ${className}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-accent-soft p-2 text-accent-ink"><CalendarClock size={20} aria-hidden="true" /></div>
        <div className="min-w-0">
          <h2 className="font-bold">Tu suscripción {PLAN_NAMES[notice.plan]} vence {when}</h2>
          <p className="mt-1 text-sm text-ink-2">
            Tu plan {notice.annual ? 'anual' : 'mensual'} vence el {date} y se renovará automáticamente.
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => void keep()} className="rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60">
          {busy ? 'Guardando…' : 'Continúa con nosotros'}
        </button>
        <button type="button" disabled={busy} onClick={renewal.onCancel} className="rounded-xl border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-500/10">
          Darse de baja
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
