import { safeStorage } from './safeStorage';

const ANONYMOUS_USER_KEY = 'la_partideta_device_user_id';
const AUTHENTICATED_USER_KEY = 'omiki_authenticated_user_id';
let authenticatedUserId: string | null = null;

export const setAuthenticatedUserId = (userId: string | null): void => {
  authenticatedUserId = userId;
  try {
    if (userId) window.sessionStorage.setItem(AUTHENTICATED_USER_KEY, userId);
    else window.sessionStorage.removeItem(AUTHENTICATED_USER_KEY);
  } catch {
    // Some private browsing modes disable sessionStorage. The anonymous
    // identifier remains a safe fallback until the next auth event.
  }
};

export const getUserId = (): string => {
  if (authenticatedUserId) return authenticatedUserId;
  try {
    const authenticatedUserId = window.sessionStorage.getItem(AUTHENTICATED_USER_KEY);
    if (authenticatedUserId) return authenticatedUserId;
  } catch {
    // Fall back to the device identifier when sessionStorage is unavailable.
  }

  // 1. Intentar obtener un ID previo guardado en el navegador
  let userId = safeStorage.getItem(ANONYMOUS_USER_KEY);

  // 2. Si no existe (primera vez que entra), creamos uno y lo guardamos
  if (!userId) {
    userId = `anon_${crypto.randomUUID()}`;
    safeStorage.setItem(ANONYMOUS_USER_KEY, userId);
  }

  return userId;
};
