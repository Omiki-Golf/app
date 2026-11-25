import { useState } from 'react';
import { Check, Gift, Loader2 } from 'lucide-react';
import { giftCodeLabel, giftCodeService, isGiftCodeFormat, normalizeGiftCode, type GiftCodeInfo } from '../services/giftCodeService';

const inputClass = (invalid: boolean) =>
  `w-full rounded-xl border px-4 py-2.5 font-mono text-lg font-bold uppercase tracking-[0.3em] text-ink placeholder:tracking-normal placeholder:font-sans placeholder:text-sm placeholder:font-normal focus:border-transparent focus:ring-2 ${
    invalid ? 'border-red-500 focus:ring-red-400' : 'border-line-2 focus:ring-accent'
  }`;

interface GiftCodeCheckProps {
  code: string;
  info: GiftCodeInfo | null;
  error?: string;
  onChange: (code: string, info: GiftCodeInfo | null, error?: string) => void;
}

/** Alta: comprueba el código y muestra qué plan da. Se canjea al entrar tras confirmar el correo. */
export function GiftCodeCheck({ code, info, error, onChange }: GiftCodeCheckProps) {
  const [checking, setChecking] = useState(false);
  const check = async () => {
    if (!isGiftCodeFormat(code)) { onChange(code, null, 'El código tiene 8 caracteres: números y letras de la A a la F.'); return; }
    setChecking(true);
    try {
      const found = await giftCodeService.check(code);
      onChange(code, found, found ? undefined : 'Código no válido: no existe, ya se ha usado o ha caducado.');
    } catch (cause) {
      onChange(code, null, cause instanceof Error ? cause.message : 'No se ha podido comprobar el código.');
    } finally { setChecking(false); }
  };
  return (
    <div>
      <label htmlFor="register-gift-code" className="mb-1 block text-sm font-medium text-ink-2">Código regalo</label>
      <div className="flex gap-2">
        <input id="register-gift-code" value={code} name="gift-code" inputMode="text" maxLength={9} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          data-1p-ignore data-lpignore="true" data-bwignore="true" data-form-type="other"
          placeholder="Ej.: 3FA9C21B" aria-invalid={!!error} aria-describedby={error ? 'register-gift-code-error' : undefined}
          className={inputClass(!!error)}
          onChange={event => onChange(normalizeGiftCode(event.target.value).slice(0, 8), null)} />
        <button type="button" onClick={() => void check()} disabled={checking || !code}
          className="shrink-0 rounded-xl border border-accent-ring px-4 font-semibold text-accent-ink disabled:opacity-50">
          {checking ? <Loader2 size={18} className="animate-spin" aria-label="Comprobando" /> : 'Comprobar'}
        </button>
      </div>
      {error && <p id="register-gift-code-error" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {info && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-accent-ring bg-accent-soft p-3 text-sm text-ink">
          <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden="true" />
          <span>Código válido: <strong>{giftCodeLabel(info.plan, info.duration)}</strong>. No tendrás que pagar: se activa al entrar por primera vez tras confirmar tu correo.</span>
        </p>
      )}
    </div>
  );
}

/** Perfil: canjea el código en la cuenta abierta. */
export function GiftCodeRedeem({ onRedeemed }: { onRedeemed: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const redeem = async () => {
    if (!isGiftCodeFormat(code)) { setError('El código tiene 8 caracteres: números y letras de la A a la F.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await giftCodeService.redeem(code);
      setDone(`${giftCodeLabel(result.plan, result.duration)} activado. ¡Que lo disfrutes!`);
      setCode('');
      await onRedeemed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se ha podido canjear el código.');
    } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-soft">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2 text-left font-semibold text-accent-ink">
          <Gift size={18} aria-hidden="true" /> ¿Tienes un código regalo?
        </button>
      ) : (
        <>
          <label htmlFor="profile-gift-code" className="mb-1 flex items-center gap-2 font-semibold text-ink">
            <Gift size={18} className="text-accent-ink" aria-hidden="true" /> Canjear código regalo
          </label>
          <div className="flex gap-2">
            <input id="profile-gift-code" value={code} name="gift-code" inputMode="text" maxLength={9} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          data-1p-ignore data-lpignore="true" data-bwignore="true" data-form-type="other"
              placeholder="Ej.: 3FA9C21B" className={inputClass(!!error)} aria-invalid={!!error}
              onChange={event => { setCode(normalizeGiftCode(event.target.value).slice(0, 8)); setError(''); setDone(''); }} />
            <button type="button" onClick={() => void redeem()} disabled={busy || !code}
              className="shrink-0 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">
              {busy ? <Loader2 size={18} className="animate-spin" aria-label="Canjeando" /> : 'Canjear'}
            </button>
          </div>
          {error && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </>
      )}
      {done && <p role="status" className="mt-2 flex items-center gap-2 text-sm font-semibold text-accent-ink"><Check size={16} aria-hidden="true" />{done}</p>}
    </div>
  );
}
