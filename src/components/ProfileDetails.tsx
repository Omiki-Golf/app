import { WriteForm } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, Loader2, Save, User, X } from 'lucide-react';
import { UserProfile } from '../types';
import { userService } from '../services/userService';
import { AVATAR_OPTIONS, DEFAULT_AVATAR_URL, normalizeAvatarUrl } from '../utils/avatarOptions';
import { useTranslation } from 'react-i18next';

interface ProfileDetailsProps {
  profile: UserProfile | null;
  userId: string;
  email?: string;
  onBack: () => void;
  onSaved: () => Promise<void> | void;
}

export const ProfileDetails: React.FC<ProfileDetailsProps> = ({
  profile,
  userId,
  email,
  onBack,
  onSaved,
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

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setNick(profile?.nick ?? '');
    setAvatarUrl(normalizeAvatarUrl(profile?.avatar_url ?? DEFAULT_AVATAR_URL));
    setShowSelectedAvatar(Boolean(profile?.avatar_url));
  }, [profile]);

  const checkNick = async () => {
    if (profile) return true;
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
    if (!displayName.trim()) return;
    if (!profile && !(await checkNick())) {
      setError(t('auth.errors.nick'));
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);
    try {
      if (profile) {
        await userService.updateProfile(profile.user_id, {
          display_name: displayName.trim(),
          avatar_url: avatarUrl,
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
      setError(t('profile.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-app transition-colors">
      <main className="max-w-lg mx-auto px-4 py-6">
        <NavigationButton destination="back"
          onClick={onBack}
          className="flex items-center gap-2 text-ink-3 hover:text-ink mb-6"
        />

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
                    disabled={!!profile}
                    required
                    minLength={2}
                    maxLength={24}
                    placeholder={t('auth.nickPlaceholder')}
                    className={`w-full px-4 py-3 pr-10 border rounded-xl ${
                      profile ? 'bg-card-2 text-ink-3 border-line opacity-80' : 'bg-card text-ink border-line-2 focus:ring-2 focus:ring-accent'
                    }`}
                  />
                  {!profile && nickStatus === 'available' && <Check className="absolute right-3 top-3.5 text-accent-ink" size={20} />}
                  {!profile && nickStatus === 'taken' && <X className="absolute right-3 top-3.5 text-red-500" size={20} />}
                </div>
                {profile ? (
                  <p className="text-xs text-ink-4 mt-1">{t('profile.nickLocked')}</p>
                ) : (
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
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">{t('auth.name')}</label>
                <input
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setSaved(false);
                  }}
                  required
                  maxLength={60}
                  className="w-full px-4 py-3 bg-card text-ink border border-line-2 rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

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
                disabled={saving || !displayName.trim() || (!profile && !nick.trim())}
                className="w-full flex items-center justify-center gap-2 bg-accent text-on-accent px-6 py-3 rounded-xl hover:bg-accent-hover font-semibold disabled:opacity-50"
              >
                {saving ? <Loader2 size={19} className="animate-spin" /> : <Save size={19} />}
                {saving ? t('profile.saving') : profile ? t('profile.save') : t('profile.create')}
              </button>
            </WriteForm>
        </section>
      </main>
    </div>
  );
};
