import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, Check, X, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { userService } from '../services/userService';
import { registrationFieldErrors, type RegistrationField, playerSignupMetadata, isExistingAccountSignup, type BillingPeriod, type PaidPlan } from '../utils/playerRegistration';
import { ExistingAccountNotice } from './ExistingAccountNotice';
import { EmailSentModal } from './EmailSentModal';
import { DEFAULT_AVATAR_URL } from '../utils/avatarOptions';
import AvatarPicker from './AvatarPicker';

// Id del control de cada campo, para llevar el foco al primero que tenga error.
const FIELD_IDS: Record<RegistrationField, string> = {
  nick: 'register-nick',
  email: 'register-email',
  password: 'register-password',
  handicap: 'register-handicap',
  age: 'register-age',
  over14: 'register-over14',
  acceptedTerms: 'register-terms',
};

const inputClass = (invalid: boolean) =>
  `w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:border-transparent ${
    invalid ? 'border-red-500 bg-red-50/40 focus:ring-red-400 dark:bg-red-500/10' : 'border-line-2 focus:ring-accent'
  }`;

const FieldError = ({ field, message }: { field: RegistrationField; message?: string }) =>
  message ? (
    <p id={`${FIELD_IDS[field]}-error`} className="mt-1 flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
      <AlertCircle size={13} className="mt-px shrink-0" />
      {message}
    </p>
  ) : null;

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
  const [showHandicapInfo, setShowHandicapInfo] = useState(false);
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
  const [existingEmail, setExistingEmail] = useState('');
  const nickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegistrationField, string>>>({});

  const clearFieldError = (field: RegistrationField) =>
    setFieldErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });

  const focusField = (field: RegistrationField) => {
    const element = document.getElementById(FIELD_IDS[field]);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  };

  const invalidProps = (field: RegistrationField) =>
    fieldErrors[field] ? { 'aria-invalid': true, 'aria-describedby': `${FIELD_IDS[field]}-error` } : {};

  // Los avisos generales se pintan arriba del formulario: subir para que se lean.
  useEffect(() => {
    if (error || existingEmail) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [error, existingEmail]);

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
    const validation = registrationFieldErrors({ nick, email, password, handicap, age, over14, acceptedTerms });
    setError('');
    setFieldErrors(validation);
    const firstInvalid = (Object.keys(FIELD_IDS) as RegistrationField[]).find(field => validation[field]);
    if (firstInvalid) { focusField(firstInvalid); return; }
    submitting.current = true;
    setLoading(true);
    setExistingEmail('');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (session) throw new Error('Ya tienes una sesión abierta. Vuelve a tu perfil para continuar.');
      if (!(await userService.checkNickAvailable(nick.trim()))) {
        setFieldErrors({ nick: 'Este nick ya está ocupado. Elige otro.' });
        focusField('nick');
        return;
      }
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: {
          emailRedirectTo: `${window.location.origin}/?email-confirmed=1&player-registration=1`,
          data: playerSignupMetadata({ id: checkoutId, period, plan }, { nick, displayName, avatarUrl, handicap, country, postalCode, age }),
        },
      });
      if (isExistingAccountSignup(data.user, authError)) { setExistingEmail(email.trim()); return; }
      if (authError) throw authError;
      if (!data.user) throw new Error('No se ha podido crear la cuenta.');
      if (data.session && data.user.email_confirmed_at) { onRegistered(); return; }
      setPassword('');
      setConfirmationEmail(email.trim());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se ha podido crear la cuenta. Reintenta.';
      setError(message);
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

          {existingEmail && <ExistingAccountNotice email={existingEmail} onLogin={onLogin} />}
          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl mb-4 flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Avatar selection */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-ink-2 mb-2">Avatar</label>
            <AvatarPicker value={avatarUrl} onSelect={setAvatarUrl} />
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
                onChange={(e) => { setNick(e.target.value); clearFieldError('nick'); }}
                placeholder="Tu apodo unico"
                {...invalidProps('nick')}
                className={`${inputClass(!!fieldErrors.nick)} pr-10`}
                style={fieldErrors.nick ? undefined : { borderColor: nickStatus === 'available' ? '#059669' : nickStatus === 'taken' ? '#ef4444' : '#d1d5db' }}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {nickStatus === 'checking' && <div className="w-4 h-4 border-2 border-line-2 border-t-emerald-600 rounded-full animate-spin" />}
                {nickStatus === 'available' && <Check size={18} className="text-accent-ink" />}
                {nickStatus === 'taken' && <X size={18} className="text-red-500" />}
              </div>
            </div>
            {!fieldErrors.nick && nickStatus === 'available' && <p className="text-xs text-accent-ink mt-1">Nick disponible</p>}
            {!fieldErrors.nick && nickStatus === 'taken' && <p className="text-xs text-red-500 mt-1">Este Nick ya esta cogido</p>}
            {!fieldErrors.nick && nickStatus === 'idle' && nick.length > 0 && <p className="text-xs text-ink-4 mt-1">Minimo 3 caracteres</p>}
            <FieldError field="nick" message={fieldErrors.nick} />
          </div>

          {/* Credenciales obligatorias */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="register-email" className="block text-sm font-medium text-ink-2 mb-1">Correo electrónico *</label>
              <input id="register-email" required autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                placeholder="tu@email.com"
                {...invalidProps('email')}
                className={inputClass(!!fieldErrors.email)}
              />
              <FieldError field="email" message={fieldErrors.email} />
            </div>
            <div>
              <label htmlFor="register-password" className="block text-sm font-medium text-ink-2 mb-1">Contraseña *</label>
              <div className="relative">
                <input id="register-password" required autoComplete="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                  placeholder="Min 6, mayus, minus, especial"
                  {...invalidProps('password')}
                  className={`${inputClass(!!fieldErrors.password)} pr-10`}
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
              <FieldError field="password" message={fieldErrors.password} />
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
              <div className="mb-1 flex items-center gap-1.5">
                <label htmlFor="register-handicap" className="block text-sm font-medium text-ink-2">Handicap de juego 18 hoyos</label>
                <button
                  type="button"
                  onClick={() => setShowHandicapInfo(current => !current)}
                  aria-expanded={showHandicapInfo}
                  aria-controls="register-handicap-info"
                  aria-label="Qué hándicap poner"
                  className="rounded-full p-0.5 text-ink-3 transition-colors hover:text-ink"
                >
                  <Info size={15} />
                </button>
              </div>
              {showHandicapInfo && (
                <p id="register-handicap-info" className="mb-2 rounded-lg border border-line bg-card-2 p-2.5 text-xs leading-relaxed text-ink-2">
                  Tu golf, tu hándicap, tus cervezas. Aquí no buscamos tu hándicap oficial con decimales:
                  pon el hándicap con el que juegas 18 hoyos. El grupo lo irá ajustando partida a partida.
                </p>
              )}
              <input id="register-handicap"
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                max="54"
                value={handicap}
                // Solo enteros: se descarta cualquier decimal o signo al escribir.
                onChange={(e) => { setHandicap(e.target.value.replace(/\D/g, '').slice(0, 2)); clearFieldError('handicap'); }}
                onKeyDown={(e) => { if (['.', ',', '-', '+', 'e', 'E'].includes(e.key)) e.preventDefault(); }}
                placeholder="Ej: 18"
                {...invalidProps('handicap')}
                className={inputClass(!!fieldErrors.handicap)}
              />
              <FieldError field="handicap" message={fieldErrors.handicap} />
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
                onChange={(e) => { setAge(e.target.value); clearFieldError('age'); }}
                placeholder="Ej: 35"
                {...invalidProps('age')}
                className={inputClass(!!fieldErrors.age)}
              />
              <FieldError field="age" message={fieldErrors.age} />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3 mb-6">
            <div>
              <label className={`flex items-start gap-2 cursor-pointer rounded-lg ${fieldErrors.over14 ? 'ring-1 ring-red-500 bg-red-50/40 p-1.5 dark:bg-red-500/10' : ''}`}>
                <input id="register-over14" type="checkbox" checked={over14} onChange={(e) => { setOver14(e.target.checked); clearFieldError('over14'); }} {...invalidProps('over14')} className="mt-0.5 w-5 h-5 accent-emerald-600" />
                <span className="text-sm text-ink-3">Confirmo que tengo al menos 14 anos</span>
              </label>
              <FieldError field="over14" message={fieldErrors.over14} />
            </div>
            <div>
            <label className={`flex items-start gap-2 cursor-pointer rounded-lg ${fieldErrors.acceptedTerms ? 'ring-1 ring-red-500 bg-red-50/40 p-1.5 dark:bg-red-500/10' : ''}`}>
              <input id="register-terms" type="checkbox" checked={acceptedTerms} onChange={(e) => { setAcceptedTerms(e.target.checked); clearFieldError('acceptedTerms'); }} {...invalidProps('acceptedTerms')} className="mt-0.5 w-5 h-5 accent-emerald-600" />
              <span className="text-sm text-ink-3">Acepto los <a href="#" className="text-accent-ink underline">terminos</a> y la <a href="#" className="text-accent-ink underline">politica de privacidad</a></span>
            </label>
            <FieldError field="acceptedTerms" message={fieldErrors.acceptedTerms} />
            </div>
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
