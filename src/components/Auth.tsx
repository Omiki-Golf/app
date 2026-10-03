import { getReadOnly } from '../services/userRestriction';
import { adminService } from '../services/adminService';
import { NavigationButton } from './NavigationButton';
import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, AlertCircle, Eye, EyeOff, Check, X } from 'lucide-react';
import { clearStoredAuthSession, supabase } from '../services/supabaseClient';
import { UserTier } from '../types';
import { EmailSentModal } from './EmailSentModal';
import { userService } from '../services/userService';
import { AVATAR_OPTIONS, DEFAULT_AVATAR_URL } from '../utils/avatarOptions';
import { useTranslation } from 'react-i18next';

interface AuthProps {
  onAuthSuccess: (userId: string) => void | Promise<void>;
  onShowPlans?: () => void;
  recoveryRequested?: boolean;
  onRecoveryComplete?: () => void;
  onBack: () => void;
  backDestination?: 'back' | 'home';
}

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

export default function Auth({ onShowPlans, onAuthSuccess, recoveryRequested = false, onRecoveryComplete, onBack, backDestination = 'back' }: AuthProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>(recoveryRequested ? 'reset-password' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showEmailSentModal, setShowEmailSentModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedTier, setSelectedTier] = useState<UserTier>('Express');
  const [displayName, setDisplayName] = useState('');
  const [nick, setNick] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR_URL);
  const [nickStatus, setNickStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [nickSuggestion, setNickSuggestion] = useState('');
  const tierOptions: UserTier[] = ['Express', 'Player', 'Team'];

  const checkNick = async () => {
    const candidate = nick.trim();
    setNickSuggestion('');
    if (candidate.length < 2) {
      setNickStatus('taken');
      return false;
    }

    setNickStatus('checking');
    try {
      if (await userService.checkNickAvailable(candidate)) {
        setNickStatus('available');
        return true;
      }

      setNickStatus('taken');
      const base = (candidate || displayName || email.split('@')[0])
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .slice(0, 18) || 'jugador';

      for (let suffix = 2; suffix <= 20; suffix += 1) {
        const suggestion = `${base}${suffix}`;
        if (await userService.checkNickAvailable(suggestion)) {
          setNickSuggestion(suggestion);
          break;
        }
      }
      return false;
    } catch {
      setNickStatus('idle');
      setError(t('auth.errors.nickCheck'));
      return false;
    }
  };

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset-password');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await supabase.auth.signOut({ scope: 'local' });
      await clearStoredAuthSession();

      const identifier = email.trim();
      let signedInUser;
      if (identifier.includes('@')) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password });
        if (error) throw error;
        signedInUser = data.user;
      } else {
        signedInUser = await adminService.login(identifier, password);
      }
      if (signedInUser) {
        if (await adminService.getAccount(signedInUser)) return;

        const { golfService } = await import('../services/golfService');
        if (!(await getReadOnly())) await golfService.linkGroupsToAuthUser();
        await onAuthSuccess(signedInUser.id);
      }
    } catch (err: any) {
      setError(err.message || t('auth.errors.login'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError(t('auth.errors.passwords'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.errors.passwordLength'));
      return;
    }

    if (!displayName.trim()) {
      setError(t('auth.errors.name'));
      return;
    }

    if (!(await checkNick())) {
      setError(t('auth.errors.nick'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/?email-confirmed=1`,
          data: {
            user_tier: selectedTier,
            tier: selectedTier,
            requested_plan: selectedTier.toLowerCase(),
            registration_pending: true,
            nick: nick.trim(),
            display_name: displayName.trim(),
            avatar_url: avatarUrl,
            accepted_terms: false,
          },
        },
      });

      if (error) throw error;

      if (data.user && data.session) {
        const registeredUserId = data.user.id;
        const { golfService } = await import('../services/golfService');
        if (!(await getReadOnly())) await golfService.linkGroupsToAuthUser();
        setMessage(t('auth.messages.accountCreated'));
        setTimeout(() => {
          void onAuthSuccess(registeredUserId);
        }, 1500);
      } else if (data.user) {
        setShowEmailSentModal(true);
      }
    } catch (err: any) {
      setError(err.message || t('auth.errors.register'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (email.trim().includes('@')) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/?auth-action=recovery`,
        });
        if (error) throw error;
      } else {
        await adminService.recover(email.trim());
      }

      setMessage(t('auth.messages.recoverySent'));
    } catch (err: any) {
      setError(err.message || t('auth.errors.recovery'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError(t('auth.errors.passwords'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.errors.passwordLength'));
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      onRecoveryComplete?.();
      setMessage(t('auth.messages.passwordUpdated'));
      setTimeout(() => {
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      }, 2000);
    } catch (err: any) {
      setError(err.message || t('auth.errors.update'));
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'login') {
    return (
      <div className="min-h-screen bg-app p-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8">
          <NavigationButton destination={backDestination}
            onClick={onBack}
            className="flex items-center gap-2 text-ink-3 hover:text-ink mb-6 transition-colors"
          />

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-full mb-4">
              <User className="w-8 h-8 text-accent-ink" />
            </div>
            <h2 className="text-3xl font-bold text-ink mb-2">{t('auth.login')}</h2>
            <p className="text-ink-3">{t('auth.loginSubtitle')}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                {t('auth.identifier')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-ink-4" size={20} />
                <input
                  type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.identifierPlaceholder')}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-ink-4" size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-12 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-ink-4 hover:text-ink-3 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2">
                <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors font-semibold shadow-card disabled:opacity-50"
            >
              {loading ? t('auth.loggingIn') : t('auth.login')}
            </button>

            <div className="text-center space-y-2">
              <button
                type="button"
                onClick={() => setMode('forgot-password')}
                className="text-sm text-accent-ink hover:text-accent-ink font-medium"
              >
                {t('auth.forgot')}
              </button>
              <div className="text-sm text-ink-3">
                {t('auth.noAccount')}{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-accent-ink hover:text-accent-ink font-medium"
                >
                  {t('auth.registerLink')}
                </button>
              </div>
            </div>
          </form>
          {onShowPlans && (
            <button type="button" onClick={onShowPlans}
              className="mt-6 w-full rounded-xl border border-line bg-card-2 px-6 py-3 font-semibold text-ink-2 transition-colors hover:bg-neutral-hover">
              {t('auth.plans')}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'register') {
    return (
      <div className="min-h-screen bg-app p-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8">
          <NavigationButton destination="back"
            onClick={() => setMode('login')}
            className="flex items-center gap-2 text-ink-3 hover:text-ink mb-6 transition-colors"
          />

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-full mb-4">
              <User className="w-8 h-8 text-accent-ink" />
            </div>
            <h2 className="text-3xl font-bold text-ink mb-2">{t('auth.createAccount')}</h2>
            <p className="text-ink-3">{t('auth.registerSubtitle')}</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">{t('auth.name')}</label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 text-ink-4" size={20} />
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={t('auth.namePlaceholder')}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-card text-ink border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">{t('auth.nick')}</label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 text-ink-4" size={20} />
                <input
                  type="text"
                  value={nick}
                  onChange={(event) => {
                    setNick(event.target.value);
                    setNickStatus('idle');
                    setNickSuggestion('');
                  }}
                  onBlur={() => void checkNick()}
                  placeholder={t('auth.nickPlaceholder')}
                  minLength={2}
                  maxLength={24}
                  required
                  className="w-full pl-10 pr-10 py-3 bg-card text-ink border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                {nickStatus === 'available' && <Check className="absolute right-3 top-3.5 text-accent-ink" size={20} />}
                {nickStatus === 'taken' && <X className="absolute right-3 top-3.5 text-red-500" size={20} />}
              </div>
              {nickStatus === 'checking' && <p className="text-xs text-ink-3 mt-1">{t('auth.checkingNick')}</p>}
              {nickStatus === 'available' && <p className="text-xs text-accent-ink mt-1">{t('auth.nickAvailable')}</p>}
              {nickStatus === 'taken' && (
                <p className="text-xs text-red-600 mt-1">
                  {t('auth.nickTaken')}
                  {nickSuggestion && (
                    <button
                      type="button"
                      onClick={() => {
                        setNick(nickSuggestion);
                        setNickStatus('available');
                        setNickSuggestion('');
                      }}
                      className="ml-1 font-semibold underline"
                    >
                      {t('auth.useNick', { nick: nickSuggestion })}
                    </button>
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">{t('auth.avatar')}</label>
              <div className="grid grid-cols-5 gap-2">
                {AVATAR_OPTIONS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setAvatarUrl(avatar.url)}
                    className={`aspect-square rounded-full overflow-hidden border-2 transition-all ${
                      avatarUrl === avatar.url ? 'border-accent ring-2 ring-accent-ring' : 'border-line'
                    }`}
                    aria-label={t('auth.selectAvatar', { name: avatar.name })}
                    aria-pressed={avatarUrl === avatar.url}
                  >
                    <img src={avatar.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-ink-4" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-ink-4" size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.minPassword')}
                  required
                  className="w-full pl-10 pr-12 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-ink-4 hover:text-ink-3 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                {t('auth.confirmPassword')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-ink-4" size={20} />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.repeatPassword')}
                  required
                  className="w-full pl-10 pr-12 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3.5 text-ink-4 hover:text-ink-3 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-3">
                {t('auth.userType')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {tierOptions.map((tier) => {
                  const isSelected = selectedTier === tier;

                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setSelectedTier(tier)}
                      className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        isSelected
                          ? 'border-accent bg-accent-soft text-accent-ink'
                          : 'border-line bg-card text-ink-3 hover:border-line-2'
                      }`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2">
                <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {message && (
              <div className="bg-accent-soft border border-accent-ring text-accent-ink px-4 py-3 rounded-xl">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors font-semibold shadow-card disabled:opacity-50"
            >
              {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
            </button>

            <div className="text-center text-sm text-ink-3">
              {t('auth.hasAccount')}{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-accent-ink hover:text-accent-ink font-medium"
              >
                {t('auth.login')}
              </button>
            </div>
          </form>
          {showEmailSentModal && (
            <EmailSentModal
              email={email}
              onAccept={() => {
                setShowEmailSentModal(false);
                onBack();
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (mode === 'reset-password') {
    return (
      <div className="min-h-screen bg-app p-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-full mb-4">
              <Lock className="w-8 h-8 text-accent-ink" />
            </div>
            <h2 className="text-3xl font-bold text-ink mb-2">{t('auth.resetTitle')}</h2>
            <p className="text-ink-3">{t('auth.resetSubtitle')}</p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                {t('auth.resetTitle')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-ink-4" size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.minPassword')}
                  required
                  className="w-full pl-10 pr-12 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-ink-4 hover:text-ink-3 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2">
                {t('auth.confirmNewPassword')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-ink-4" size={20} />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.repeatPassword')}
                  required
                  className="w-full pl-10 pr-12 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3.5 text-ink-4 hover:text-ink-3 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2">
                <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {message && (
              <div className="bg-accent-soft border border-accent-ring text-accent-ink px-4 py-3 rounded-xl">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors font-semibold shadow-card disabled:opacity-50"
            >
              {loading ? t('auth.updating') : t('auth.updatePassword')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app p-4 flex items-center justify-center">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8">
        <NavigationButton destination="back"
          onClick={() => setMode('login')}
          className="flex items-center gap-2 text-ink-3 hover:text-ink mb-6 transition-colors"
        />

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-full mb-4">
            <Mail className="w-8 h-8 text-accent-ink" />
          </div>
          <h2 className="text-3xl font-bold text-ink mb-2">{t('auth.recoverTitle')}</h2>
          <p className="text-ink-3">{t('auth.recoverSubtitle')}</p>
        </div>

        <form onSubmit={handleForgotPassword} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-2">
              {t('auth.identifier')}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-ink-4" size={20} />
              <input
                type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.identifierPlaceholder')}
                required
                className="w-full pl-10 pr-4 py-3 border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="bg-accent-soft border border-accent-ring text-accent-ink px-4 py-3 rounded-xl">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover transition-colors font-semibold shadow-card disabled:opacity-50"
          >
            {loading ? t('auth.sending') : t('auth.sendRecovery')}
          </button>
        </form>
      </div>
    </div>
  );
}
