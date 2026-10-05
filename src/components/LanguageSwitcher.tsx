import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages, type SupportedLanguage } from '../i18n';

interface LanguageSwitcherProps {
  className?: string;
}

const languageOptions: ReadonlyArray<{ code: SupportedLanguage }> = [
  { code: 'es' },
  { code: 'en' },
  { code: 'fr' },
  { code: 'it' },
];

function FlagIcon({ language, size = 'md' }: { language: SupportedLanguage; size?: 'sm' | 'md' }) {
  const dimensions = size === 'md' ? 'h-8 w-8' : 'h-7 w-7';

  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full border border-black/15 bg-white shadow-sm ${dimensions}`} aria-hidden="true">
      <svg viewBox="0 0 30 20" className="h-full w-full" preserveAspectRatio="none">
        {language === 'es' && (
          <>
            <rect width="30" height="20" fill="#AA151B" />
            <rect y="5" width="30" height="10" fill="#F1BF00" />
          </>
        )}
        {language === 'en' && (
          <>
            <rect width="30" height="20" fill="#012169" />
            <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
            <path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="1.7" />
            <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
            <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="3.2" />
          </>
        )}
        {language === 'fr' && (
          <>
            <rect width="10" height="20" fill="#0055A4" />
            <rect x="10" width="10" height="20" fill="#fff" />
            <rect x="20" width="10" height="20" fill="#EF4135" />
          </>
        )}
        {language === 'it' && (
          <>
            <rect width="10" height="20" fill="#009246" />
            <rect x="10" width="10" height="20" fill="#fff" />
            <rect x="20" width="10" height="20" fill="#CE2B37" />
          </>
        )}
      </svg>
    </span>
  );
}

export function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const resolvedLanguage = (i18n.resolvedLanguage || i18n.language).split('-')[0] as SupportedLanguage;
  const currentLanguage = supportedLanguages.includes(resolvedLanguage) ? resolvedLanguage : 'es';

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const selectLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('language.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${t('language.label')}: ${t(`language.${currentLanguage}`)}`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink shadow-soft transition-all hover:bg-card-2 active:scale-95 max-[360px]:h-10 max-[360px]:w-10"
      >
        <FlagIcon language={currentLanguage} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('language.label')}
          className="absolute right-0 top-12 z-[110] flex flex-col gap-2 rounded-2xl border border-line bg-card p-2 shadow-card"
        >
          {languageOptions.map(({ code }) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={currentLanguage === code}
              onClick={() => selectLanguage(code)}
              aria-label={t(`language.${code}`)}
              title={t(`language.${code}`)}
              className={`rounded-full p-0.5 transition-all hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                currentLanguage === code ? 'bg-accent ring-2 ring-accent-ring' : 'bg-transparent hover:bg-card-2'
              }`}
            >
              <FlagIcon language={code} size="sm" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
