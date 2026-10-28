import { useState } from 'react';
import { AlertCircle, KeyRound, LogIn, MailCheck } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface ExistingAccountNoticeProps {
  email: string;
  onLogin: () => void;
}

// Aviso cuando alguien intenta registrarse con un correo que ya tiene cuenta.
export function ExistingAccountNotice({ email, onLogin }: ExistingAccountNoticeProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const sendRecovery = async () => {
    setSending(true);
    setError('');
    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/?auth-action=recovery`,
      });
      if (recoveryError) throw recoveryError;
      setSent(true);
    } catch {
      setError('No se ha podido enviar el correo. Inténtalo de nuevo en unos minutos.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="flex items-start gap-2 font-semibold">
        <AlertCircle size={18} className="mt-0.5 shrink-0" />
        <span>Ya existe una cuenta con el correo <span className="break-all">{email.trim()}</span>.</span>
      </p>
      <p className="mt-1 pl-6">Inicia sesión con ella o, si no recuerdas la contraseña, te enviamos un correo para crear una nueva.</p>

      {sent ? (
        <p role="status" className="mt-3 flex items-center gap-2 pl-6 font-semibold text-accent-ink">
          <MailCheck size={18} className="shrink-0" /> Te hemos enviado un correo para restablecer la contraseña.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 pl-6 sm:flex-row">
          <button type="button" onClick={onLogin} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 font-semibold text-on-accent hover:bg-accent-hover">
            <LogIn size={16} /> Iniciar sesión
          </button>
          <button type="button" onClick={() => void sendRecovery()} disabled={sending} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-400 bg-white px-3 py-2.5 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
            <KeyRound size={16} /> {sending ? 'Enviando…' : 'Recordar contraseña'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 pl-6 text-red-700">{error}</p>}
    </div>
  );
}
