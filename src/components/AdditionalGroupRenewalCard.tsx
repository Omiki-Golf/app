import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { ADDITIONAL_GROUP_PRICE, additionalGroupDate, type AdditionalGroupSlot } from '../services/additionalGroups';

export type AdditionalGroupRenewal = AdditionalGroupSlot & { groupName: string | null };

const price = ADDITIONAL_GROUP_PRICE.toLocaleString('es-ES', { minimumFractionDigits: 2 });
const dismissKey = (item: AdditionalGroupRenewal) => `additional-renewal-ok:${item.id}:${item.expires_at}`;
const isDismissed = (item: AdditionalGroupRenewal) => {
  try { return window.localStorage.getItem(dismissKey(item)) === '1'; } catch { return false; }
};

/**
 * Aviso de un Grupo Adicional que vence en 15 días o menos. Cada Grupo Adicional tiene su
 * propia fecha. Si se renueva, «Continuar» oculta el aviso hasta el siguiente vencimiento;
 * «No renovar» lo deja vencer y su grupo se archivará ese día (se puede volver a «Renovar»).
 */
export function AdditionalGroupRenewalCard({ item, onSetRenewal, className = '' }: {
  item: AdditionalGroupRenewal;
  onSetRenewal: (slotId: string, renew: boolean) => Promise<void>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [hidden, setHidden] = useState(() => item.renew && isDismissed(item));
  if (hidden) return null;

  const date = additionalGroupDate(item.expires_at);
  const name = item.groupName ? `«${item.groupName}»` : null;
  const change = async (renew: boolean) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onSetRenewal(item.id, renew); setConfirming(false); }
    catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : 'No se ha podido guardar. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };
  const keep = () => {
    try { window.localStorage.setItem(dismissKey(item), '1'); } catch { /* sin almacenamiento: solo se oculta ahora */ }
    setHidden(true);
  };

  return (
    <section role="status" className={`rounded-2xl border border-line bg-card p-4 text-ink shadow-card ${className}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-accent-soft p-2 text-accent-ink"><CalendarClock size={20} aria-hidden="true" /></div>
        <div className="min-w-0">
          {item.renew ? <>
            <h2 className="font-bold">Tu Grupo Adicional{name ? ` de ${name}` : ''} se renueva el {date}</h2>
            <p className="mt-1 text-sm text-ink-2">Se cobrarán {price} € (IVA incluido, pago de prueba) por un año más.</p>
          </> : <>
            <h2 className="font-bold">{name ? `${name} se archivará el ${date}` : `Tu Grupo Adicional vence el ${date}`}</h2>
            <p className="mt-1 text-sm text-ink-2">Has elegido no renovar este Grupo Adicional{name ? ': ese día su grupo pasará a solo consulta' : ''}.</p>
          </>}
        </div>
      </div>
      {confirming ? (
        <div className="mt-3">
          <p className="text-sm text-ink-2">{name ? `${name} se archivará el ${date} y solo se podrá consultar.` : `El hueco del Grupo Adicional se perderá el ${date}.`} ¿No renovar?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink-2">Cancelar</button>
            <button type="button" disabled={busy} onClick={() => void change(false)} className="rounded-xl border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-500/10">{busy ? 'Guardando…' : 'No renovar'}</button>
          </div>
        </div>
      ) : item.renew ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={keep} className="rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60">Continuar</button>
          <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="rounded-xl border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-500/10">No renovar</button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => void change(true)} className="mt-3 w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60">{busy ? 'Guardando…' : 'Renovar'}</button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
