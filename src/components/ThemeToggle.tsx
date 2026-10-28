// src/components/ThemeToggle.tsx
import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

interface ThemeToggleProps {
  className?: string;
  /** Mostrar también con sesión iniciada (donde se elige la preferencia: perfil y administración). */
  alwaysVisible?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', alwaysVisible = false }) => {
  const { isDark, toggle } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  // Con sesión iniciada, el modo claro u oscuro es una preferencia del perfil: no se repite en cada pantalla.
  if (user && !alwaysVisible) return null;
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
