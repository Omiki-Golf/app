import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, Check, X, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { userService } from '../services/userService';
import { registrationError, playerSignupMetadata, type BillingPeriod, type PaidPlan } from '../utils/playerRegistration';
import { EmailSentModal } from './EmailSentModal';
import { AVATAR_OPTIONS, DEFAULT_AVATAR_URL } from '../utils/avatarOptions';

interface RegistrationFormProps {
  period: BillingPeriod;
  plan?: PaidPlan;
  onLogin: () => void;
  onBack: () => void;
  onRegistered: () => void;
  onConfirmationAccepted: () => void;
}



export const RegistrationForm: React.FC<RegistrationFormProps> = ({ period, plan = 'player', onLogin, onBack, onRegistered, onConfirmationAccepted }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nick, setNick] = useState('');
  const [nickStatus, setNickStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [displayName, setDisplayName] = useState('');
  const [handicap, setHandicap] = useState('');
  const [checkoutId] = useState(() => crypto.randomUUID());
  const submitting = useRef(false);
  const [country, setCountry] = useState('España');
  const [postalCode, setPostalCode] = useState('');
  const [age, setAge] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR_URL);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [over14, setOver14] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const nickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (nick.length < 3) {
      setNickStatus('idle');
      return;
    }
    let cancelled = false;
    setNickStatus('checking');
    if (nickTimerRef.current) clearTimeout(nickTimerRef.current);
    nickTimerRef.current = setTimeout(async () => {
      try {
        const available = await userService.checkNickAvailable(nick);
        if (!cancelled) setNickStatus(available ? 'available' : 'taken');
      } catch {
        if (!cancelled) setNickStatus('idle');
      }
    }, 500);
    return () => { cancelled = true; if (nickTimerRef.current) clearTimeout(nickTimerRef.current); };
  }, [nick]);

  const handleSubmit = async () => {
    if (submitting.current) return;
    const validation = registrationError({ nick, email, password, handicap, age, over14, acceptedTerms });
    if (validation) { setError(validation); return; }
    submitting.current = true;
    setLoading(true);
    setError('');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (session) throw new Error('Ya tienes una sesión abierta. Vuelve a tu perfil para continuar.');
      if (!(await userService.checkNickAvailable(nick.trim()))) throw new Error('Este nick ya está ocupado. Elige otro.');
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: {
          emailRedirectTo: `${window.location.origin}/?email-confirmed=1&player-registration=1`,
          data: playerSignupMetadata({ id: checkoutId, period, plan }, { nick, displayName, avatarUrl, handicap, country, postalCode, age }),
        },
      });
      if (authError) throw authError;
      if (!data.user) throw new Error('No se ha podido crear la cuenta.');
      if (data.user.identities?.length === 0) throw new Error('Este correo ya está registrado. Inicia sesión para continuar.');
      if (data.session && data.user.email_confirmed_at) { onRegistered(); return; }
      setPassword('');
      setConfirmationEmail(email.trim());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se ha podido crear la cuenta. Reintenta.';
      setError(message.includes('already registered') ? 'Este correo ya está registrado. Inicia sesión para continuar.' : message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  if (confirmationEmail) {
    return (
      <div className="min-h-screen bg-app">
        <EmailSentModal email={confirmationEmail} onAccept={onConfirmationAccepted} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app transition-colors">
      <div className="max-w-lg mx-auto px-4 py-6">
        <NavigationButton destination="back"
          onClick={onBack}
          className="flex items-center gap-2 text-ink-3 hover:text-ink transition-colors mb-6"
        />

        <form onSubmit={event => { event.preventDefault(); void handleSubmit(); }} className="bg-card rounded-2xl shadow-card p-6 md:p-8">
          <h1 className="text-2xl font-bold text-ink mb-1">Crear cuenta {plan === 'premium' ? 'Premium' : plan === 'team' ? 'Team' : 'Player'}</h1>
          <p className="text-sm text-ink-3 mb-6">Configura tu perfil de jugador</p>

          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl mb-4 flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Avatar selection */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-ink-2 mb-2">Avatar</label>
            <div className="grid grid-cols-5 gap-3">
              {AVATAR_OPTIONS.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => setAvatarUrl(avatar.url)}
                  className={`aspect-square rounded-full overflow-hidden border-2 transition-all ${avatarUrl === avatar.url ? 'border-accent ring-2 ring-emerald-200' : 'border-line'}`}
                  aria-label={`Seleccionar ${avatar.name}`}
                  aria-pressed={avatarUrl === avatar.url}
                >
                  <img src={avatar.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Nick with real-time validation */}
          <div className="mb-4">
            <label htmlFor="register-nick" className="block text-sm font-medium text-ink-2 mb-1">
              Nick <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input id="register-nick" required minLength={3}
                type="text"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                placeholder="Tu apodo unico"
                className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent pr-10"
                style={{ borderColor: nickStatus === 'available' ? '#059669' : nickStatus === 'taken' ? '#ef4444' : '#d1d5db' }}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {nickStatus === 'checking' && <div className="w-4 h-4 border-2 border-line-2 border-t-emerald-600 rounded-full animate-spin" />}
                {nickStatus === 'available' && <Check size={18} className="text-accent-ink" />}
                {nickStatus === 'taken' && <X size={18} className="text-red-500" />}
              </div>
            </div>
            {nickStatus === 'available' && <p className="text-xs text-accent-ink mt-1">Nick disponible</p>}
            {nickStatus === 'taken' && <p className="text-xs text-red-500 mt-1">Este Nick ya esta cogido</p>}
            {nickStatus === 'idle' && nick.length > 0 && <p className="text-xs text-ink-4 mt-1">Minimo 3 caracteres</p>}
          </div>

          {/* Credenciales obligatorias */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="register-email" className="block text-sm font-medium text-ink-2 mb-1">Correo electrónico *</label>
              <input id="register-email" required autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="register-password" className="block text-sm font-medium text-ink-2 mb-1">Contraseña *</label>
              <div className="relative">
                <input id="register-password" required autoComplete="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6, mayus, minus, especial"
                  className="w-full px-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* Display name + handicap */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="register-displayName" className="block text-sm font-medium text-ink-2 mb-1">Nombre (opcional)</label>
              <input id="register-displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre real"
                className="w-full px-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="register-handicap" className="block text-sm font-medium text-ink-2 mb-1">Handicap exacto</label>
              <input id="register-handicap"
                type="number"
                step="0.1"
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                placeholder="Ej: 12.4"
                className="w-full px-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
          </div>

          {/* Country + Postal + Age */}
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="register-country" className="block text-sm font-medium text-ink-2 mb-1">Pais</label>
              <input id="register-country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="register-postalCode" className="block text-sm font-medium text-ink-2 mb-1">Cod. Postal</label>
              <input id="register-postalCode"
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="w-full px-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="register-age" className="block text-sm font-medium text-ink-2 mb-1">Edad</label>
              <input id="register-age" min={14} step={1}
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Ej: 35"
                className="w-full px-4 py-2.5 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3 mb-6">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={over14} onChange={(e) => setOver14(e.target.checked)} className="mt-0.5 w-5 h-5 accent-emerald-600" />
              <span className="text-sm text-ink-3">Confirmo que tengo al menos 14 anos</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-0.5 w-5 h-5 accent-emerald-600" />
              <span className="text-sm text-ink-3">Acepto los <a href="#" className="text-accent-ink underline">terminos</a> y la <a href="#" className="text-accent-ink underline">politica de privacidad</a></span>
            </label>
          </div>

          <WriteButton
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-on-accent font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Creando cuenta...' : 'Crear cuenta y continuar'}
          </WriteButton>

          <p className="text-xs text-ink-4 mt-3 flex items-center justify-center gap-1">
            <Info size={12} />
            Tras confirmar tu correo, continuarás a Stripe Sandbox para pagar con una tarjeta de prueba, sin cobros reales.
          </p>
          <button type="button" onClick={onLogin} className="mt-5 w-full text-center text-sm font-semibold text-accent-ink underline">¿Ya tienes cuenta? Inicia sesión</button>
        </form>
      </div>
    </div>
  );
};
