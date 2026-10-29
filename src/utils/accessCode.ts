import { safeStorage } from './safeStorage';
import { getUserId } from './userId';

const ACCESS_CODES_KEY = 'golf_access_codes';

export interface StoredAccessCode {
  roundId: string;
  code: string;
  timestamp: number;
  // Cuenta que introdujo el código: en un dispositivo compartido otra cuenta no hereda el acceso.
  ownerId?: string;
}

const isOwnCode = (entry: StoredAccessCode, roundId: string, ownerId: string) =>
  entry.roundId === roundId && entry.ownerId === ownerId;

export function generateAccessCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export const accessCodeStorage = {
  saveAccessCode: (roundId: string, code: string): void => {
    try {
      const ownerId = getUserId();
      const stored = accessCodeStorage.getAllAccessCodes();
      const updated = stored.filter(s => !isOwnCode(s, roundId, ownerId));
      updated.push({ roundId, code, timestamp: Date.now(), ownerId });
      safeStorage.setItem(ACCESS_CODES_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving access code:', error);
    }
  },

  getAccessCode: (roundId: string): string | null => {
    try {
      const stored = accessCodeStorage.getAllAccessCodes();
      const ownerId = getUserId();
      const found = stored.find(s => isOwnCode(s, roundId, ownerId));
      return found ? found.code : null;
    } catch (error) {
      console.error('Error getting access code:', error);
      return null;
    }
  },

  hasAccessCode: (roundId: string): boolean => {
    return accessCodeStorage.getAccessCode(roundId) !== null;
  },

  removeAccessCode: (roundId: string): void => {
    try {
      const ownerId = getUserId();
      const stored = accessCodeStorage.getAllAccessCodes();
      const updated = stored.filter(s => !isOwnCode(s, roundId, ownerId));
      safeStorage.setItem(ACCESS_CODES_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Error removing access code:', error);
    }
  },

  getAllAccessCodes: (): StoredAccessCode[] => {
    try {
      const stored = safeStorage.getItem(ACCESS_CODES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting all access codes:', error);
      return [];
    }
  },

  clearOldAccessCodes: (daysOld: number = 30): void => {
    try {
      const stored = accessCodeStorage.getAllAccessCodes();
      const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      const updated = stored.filter(s => s.timestamp > cutoff);
      safeStorage.setItem(ACCESS_CODES_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Error clearing old access codes:', error);
    }
  }
};
