import { WriteForm } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, Loader2, Save, User, X } from 'lucide-react';
import { UserProfile } from '../types';
import { userService } from '../services/userService';
import { AVATAR_OPTIONS, DEFAULT_AVATAR_URL, normalizeAvatarUrl } from '../utils/avatarOptions';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { DeleteAccountSection } from './DeleteAccountSection';

interface ProfileDetailsProps {
  profile: UserProfile | null;
  userId: string;
  email?: string;
  onBack: () => void;
  onSaved: () => Promise<void> | void;
  /** Tras darse de baja: cerrar la sesión y volver al inicio. */
  onAccountDeleted?: () => void;
  onOpenGroups?: () => void;
  messagesButton?: React.ReactNode;
}

export const ProfileDetails: React.FC<ProfileDetailsProps> = ({
  profile,
  userId,
  email,
  onBack,
  onSaved,
  onAccountDeleted,
  onOpenGroups,
  messagesButton,
}) => {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [nick, setNick] = useState(profile?.nick ?? '');
  const [avatarUrl, setAvatarUrl] = useState(normalizeAvatarUrl(profile?.avatar_url));
  const [showSelectedAvatar, setShowSelectedAvatar] = useState(Boolean(profile?.avatar_url));
  const [nickStatus, setNickStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [nickSuggestion, setNickSuggestion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [supportIdCopied, setSupportIdCopied] = useState(false);
  const [showSupportId, setShowSupportId] = useState(false);
  const [handicap, setHandicap] = useState(profile?.exact_handicap?.toString() ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [postalCode, setPostalCode] = useState(profile?.postal_code ?? '');
  const [age, setAge] = useState(profile?.age?.toString() ?? '');

  const copySupportId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
    } catch {
      const field = document.createElement('textarea');
      field.value = userId;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setSupportIdCopied(true);
    window.setTimeout(() => setSupportIdCopied(false), 2000);
  };

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setNick(profile?.nick ?? '');
    setAvatarUrl(normalizeAvatarUrl(profile?.avatar_url ?? DEFAULT_AVATAR_URL));
    setShowSelectedAvatar(Boolean(profile?.avatar_url));
    setHandicap(profile?.exact_handicap?.toString() ?? '');
    setCountry(profile?.country ?? '');
    setPostalCode(profile?.postal_code ?? '');
    setAge(profile?.age?.toString() ?? '');
  }, [profile]);

  const checkNick = async () => {
    const candidate = nick.trim();
    setNickSuggestion('');
    if (profile && candidate === `${profile.nick}123#`) {
      setNickStatus('idle');
      return true;
    }
    if (profile && candidate.toLocaleLowerCase() === profile.nick.trim().toLocaleLowerCase()) {
      setNickStatus('idle');
      return true;
    }
    if (candidate.length < 2 || candidate.length > 24 || candidate.includes('#')) {
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
      const base = candidate
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

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (profile && nick.trim() === `${profile.nick}123#`) {
      setNick(profile.nick);
      setNickStatus('idle');
      setNickSuggestion('');
      setShowSupportId(true);
      setSaved(false);
      setError('');
      return;
    }
    if (!profile && !displayName.trim()) return;
    if (handicap.trim() && !Number.isFinite(Number(handicap))) {
      setError('Introduce un hándicap válido.');
      return;
    }
    if (age.trim() && (!Number.isInteger(Number(age)) || Number(age) < 14)) {
      setError('La edad debe ser un número entero de al menos 14 años.');
      return;
    }
    if (!(await checkNick())) {
      setError(t('auth.errors.nick'));
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);
    try {
      if (profile) {
        if (nick.trim() !== profile.nick) await userService.renameMyNick(nick.trim());
        await userService.updateProfile(profile.user_id, {
          // null (no undefined) para que vaciar un campo lo borre de verdad en la base de datos.
          display_name: displayName.trim() || null,
          avatar_url: avatarUrl,
          exact_handicap: handicap.trim() ? Number(handicap) : 0,
          country: country.trim() || null,
          postal_code: postalCode.trim() || null,
          age: age.trim() ? Number(age) : null,
        });
      } else {
        await userService.createProfile({
          user_id: userId,
          nick: nick.trim(),
          display_name: displayName.trim(),
          avatar_url: avatarUrl,
          exact_handicap: 0,
          default_tee: 'amarillo',
          accepted_terms: false,
        });
      }
      await onSaved();
      setSaved(true);
    } catch (saveError) {
      console.error('Error actualizando el perfil:', saveError);
      const message = saveError && typeof saveError === 'object' && 'message' in saveError ? String(saveError.message) : '';
      setError(message.includes('nick') || message.includes('Nick') ? message : t('profile.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-app transition-colors">
      <main className="max-w-lg mx-auto px-4 py-6">
        <TopBar left={<NavigationButton destination="back" onClick={onBack} />} center={messagesButton} />

        <section className="bg-card rounded-2xl shadow-card p-6">
          <div className="text-center mb-7">
            <div className="mb-3 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-accent-ring bg-accent-soft">
              {showSelectedAvatar ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="text-accent-ink" size={28} />
              )}
            </div>
            <h1 className="text-2xl font-bold text-ink">{t('profile.details')}</h1>
            <p className="text-sm text-ink-3 mt-1">{t('profile.detailsDescription')}</p>
          </div>

          <WriteForm onSubmit={handleSave} className="space-y-6">
              {!profile && (
                <div className="rounded-xl border border-accent-ring bg-accent-soft p-4 text-sm text-ink-2">
                  {t('profile.legacy')}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">{t('auth.email')}</label>
                <input value={email ?? ''} disabled className="w-full px-4 py-3 bg-card-2 text-ink-3 border border-line rounded-xl opacity-80" />
              </div>

              {showSupportId && <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">{t('profile.supportId')}</label>
                <div className="flex items-stretch gap-2">
                  <code className="min-w-0 flex-1 select-all break-all rounded-xl border border-line bg-card-2 px-3 py-3 text-xs text-ink-2">{userId}</code>
                  <button type="button" onClick={() => void copySupportId()} className="inline-flex min-w-24 items-center justify-center gap-2 rounded-xl border border-line bg-card-2 px-3 font-semibold text-accent-ink hover:bg-neutral" aria-label={t('profile.copySupportId')}>
                    {supportIdCopied ? <Check size={18} /> : <Copy size={18} />}
                    {supportIdCopied ? t('profile.copiedSupportId') : t('profile.copySupportId')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-ink-4">{t('profile.supportIdHelp')}</p>
              </div>}

              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">Nick</label>
                <div className="relative">
                  <input
                    value={nick}
                    onChange={(event) => {
                      setNick(event.target.value);
                      setNickStatus('idle');
                      setNickSuggestion('');
                    }}
                    onBlur={() => void checkNick()}
                    required
                    minLength={2}
                    maxLength={profile ? 28 : 24}
                    placeholder={t('auth.nickPlaceholder')}
                    className={`w-full px-4 py-3 pr-10 border rounded-xl ${
                      'bg-card text-ink border-line-2 focus:ring-2 focus:ring-accent'
                    }`}
                  />
                  {nickStatus === 'available' && <Check className="absolute right-3 top-3.5 text-accent-ink" size={20} />}
                  {nickStatus === 'taken' && <X className="absolute right-3 top-3.5 text-red-500" size={20} />}
                </div>
                <>
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
                </>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">{t('auth.name')}</label>
                <input
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setSaved(false);
                  }}
                  required={!profile}
                  maxLength={60}
                  className="w-full px-4 py-3 bg-card text-ink border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {profile && (
                <>
                  <div>
                    <label htmlFor="profile-handicap" className="block text-sm font-medium text-ink-2 mb-2">Hándicap exacto</label>
                    <input
                      id="profile-handicap"
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={handicap}
                      onChange={(event) => { setHandicap(event.target.value); setSaved(false); }}
                      placeholder="Ej: 12.4"
                      className="w-full px-4 py-3 bg-card text-ink border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="profile-country" className="block text-sm font-medium text-ink-2 mb-2">País</label>
                      <input
                        id="profile-country"
                        value={country}
                        onChange={(event) => { setCountry(event.target.value); setSaved(false); }}
                        maxLength={60}
                        className="w-full px-4 py-3 bg-card text-ink border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-postal-code" className="block text-sm font-medium text-ink-2 mb-2">Código postal</label>
                      <input
                        id="profile-postal-code"
                        value={postalCode}
                        onChange={(event) => { setPostalCode(event.target.value); setSaved(false); }}
                        maxLength={12}
                        autoComplete="postal-code"
                        className="w-full px-4 py-3 bg-card text-ink border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-age" className="block text-sm font-medium text-ink-2 mb-2">Edad</label>
                      <input
                        id="profile-age"
                        type="number"
                        min={14}
                        step={1}
                        inputMode="numeric"
                        value={age}
                        onChange={(event) => { setAge(event.target.value); setSaved(false); }}
                        className="w-full px-4 py-3 bg-card text-ink border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                  </div>

                  <p className="flex items-center gap-2 text-sm text-ink-3">
                    {profile.accepted_terms ? <CheckCircle2 size={16} className="text-accent-ink" /> : <X size={16} className="text-red-500" />}
                    {profile.accepted_terms
                      ? 'Términos y política de privacidad aceptados. Mayor de 14 años confirmado.'
                      : 'Términos y política de privacidad pendientes de aceptar.'}
                  </p>
                </>
              )}

              <fieldset>
                <legend className="block text-sm font-medium text-ink-2 mb-3">{t('auth.avatar')}</legend>
                <div className="grid grid-cols-5 gap-3">
                  {AVATAR_OPTIONS.map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => {
                        setAvatarUrl(avatar.url);
                        setShowSelectedAvatar(true);
                        setSaved(false);
                      }}
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
              </fieldset>

              {error && <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</p>}
              {saved && (
                <p className="flex items-center gap-2 rounded-xl bg-accent-soft border border-accent-ring text-accent-ink px-4 py-3 text-sm">
                  <CheckCircle2 size={18} /> {t('profile.saved')}
                </p>
              )}

              <button
                type="submit"
                disabled={saving || (!profile && (!displayName.trim() || !nick.trim()))}
                className="w-full flex items-center justify-center gap-2 bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover font-semibold disabled:opacity-50"
              >
                {saving ? <Loader2 size={19} className="animate-spin" /> : <Save size={19} />}
                {saving ? t('profile.saving') : profile ? t('profile.save') : t('profile.create')}
              </button>
            </WriteForm>

            <section className="mt-7 border-t border-line pt-6" aria-labelledby="profile-preferences-title">
              <h2 id="profile-preferences-title" className="text-lg font-bold text-ink">{t('profile.preferences')}</h2>
              <div className="mt-3 overflow-visible rounded-xl border border-line bg-card-2">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="font-medium text-ink-2">{t('language.label')}</span>
                  <LanguageSwitcher />
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
                  <span className="font-medium text-ink-2">{t('profile.appearance')}</span>
                  <ThemeToggle />
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-3">{t('profile.preferencesHelp')}</p>
            </section>

            {profile && onAccountDeleted && <DeleteAccountSection onDeleted={onAccountDeleted} onOpenGroups={onOpenGroups} />}
        </section>
      </main>
    </div>
  );
};
