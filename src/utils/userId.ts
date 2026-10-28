import { safeStorage } from './safeStorage';
import { readExpressCredential } from './expressCredential';

const ANONYMOUS_USER_KEY = 'la_partideta_device_user_id';
const AUTHENTICATED_USER_KEY = 'omiki_authenticated_user_id';
let authenticatedUserId: string | null = null;

export const setAuthenticatedUserId = (userId: string | null): void => {
  authenticatedUserId = userId;
  try {
    if (userId) window.localStorage.setItem(AUTHENTICATED_USER_KEY, userId);
    else window.localStorage.removeItem(AUTHENTICATED_USER_KEY);
  } catch {
    // Some private browsing modes disable localStorage. The anonymous
    // identifier remains a safe fallback until the next auth event.
  }
};

/** Identificador Express de este dispositivo, si existe. No lo crea. */
export const getDeviceUserId = (): string | null => {
  const deviceId = safeStorage.getItem(ANONYMOUS_USER_KEY);
  return deviceId && deviceId.startsWith('anon_') ? deviceId : null;
};

export const isVerifiedLocalRoundCreator = (ownerId: string): boolean =>
  ownerId === getUserId() && (!ownerId.startsWith('anon_') || readExpressCredential()?.ownerId === ownerId);

export const getUserId = (): string => {
  if (authenticatedUserId) return authenticatedUserId;
  try {
    const authenticatedUserId = window.localStorage.getItem(AUTHENTICATED_USER_KEY);
    if (authenticatedUserId) return authenticatedUserId;
  } catch {
    // Fall back to the device identifier when localStorage is unavailable.
  }

  // 1. Intentar obtener un ID previo guardado en el navegador
  const ownerId = readExpressCredential()?.ownerId;
  if (ownerId) return ownerId;
  let userId = safeStorage.getItem(ANONYMOUS_USER_KEY);

  // 2. Si no existe (primera vez que entra), creamos uno y lo guardamos
  if (!userId) {
    userId = `anon_${crypto.randomUUID()}`;
    safeStorage.setItem(ANONYMOUS_USER_KEY, userId);
  }

  return userId;
};
