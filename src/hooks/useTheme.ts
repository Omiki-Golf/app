// src/hooks/useTheme.ts
import { useCallback, useEffect, useState } from 'react';
import { safeStorage } from '../utils/safeStorage';

export type Theme = 'light' | 'dark';
const KEY = 'lapartideta.theme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function stored(): Theme | null {
  const v = safeStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

function apply(theme: Theme, animate = true) {
  const el = document.documentElement;
  if (animate) el.classList.add('theme-transition');
  el.classList.toggle('dark', theme === 'dark');
  if (animate) window.setTimeout(() => el.classList.remove('theme-transition'), 250);
}

// The theme belongs to the whole application, not to the presence of a toggle.
// Apply it before React renders so authenticated screens do not start in light mode.
export function initializeTheme() {
  apply(stored() ?? systemTheme(), false);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? systemTheme());
  // true mientras el usuario no haya elegido: seguimos al sistema
  const [followsSystem, setFollowsSystem] = useState(() => stored() === null);

  useEffect(() => { apply(theme); }, [theme]);

  useEffect(() => {
    if (!followsSystem) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(systemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [followsSystem]);

  const choose = useCallback((next: Theme) => {
    setFollowsSystem(false);
    safeStorage.setItem(KEY, next);
    setTheme(next);
  }, []);

  const toggle = useCallback(() => {
    choose(theme === 'dark' ? 'light' : 'dark');
  }, [theme, choose]);

  return { theme, isDark: theme === 'dark', followsSystem, choose, toggle };
}
