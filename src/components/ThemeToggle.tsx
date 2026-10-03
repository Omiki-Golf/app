// src/components/ThemeToggle.tsx
import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { isDark, toggle } = useTheme();
  const { t } = useTranslation();
  const label = isDark ? t('theme.light') : t('theme.dark');

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-accent-ink shadow-soft transition-all hover:bg-card-2 active:scale-95 ${className}`}
    >
      {isDark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
};
