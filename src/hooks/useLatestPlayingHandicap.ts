import { useState, useEffect, useRef } from 'react';
import { golfService } from '../services/golfService';
import { UserProfile } from '../types';

const handicapMemoryCache = new Map<string, { handicap9: number; handicap18: number }>();

const getCachedHandicap = (key: string): { handicap9: number; handicap18: number } | null => {
  if (!key) return null;
  if (handicapMemoryCache.has(key)) {
    return handicapMemoryCache.get(key)!;
  }
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(`playing_hcp_${key}`) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.handicap9 === 'number' && typeof parsed?.handicap18 === 'number') {
        handicapMemoryCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {}
  return null;
};

export function useLatestPlayingHandicap(
  userId?: string | null,
  profile?: UserProfile | null,
  _currentView?: string
) {
  const profile18 = profile?.exact_handicap !== undefined && profile?.exact_handicap !== null
    ? Math.round(profile.exact_handicap)
    : 0;
  const profile9 = Math.round(profile18 / 2);

  const userKey = userId || profile?.nick || profile?.display_name || '';

  const [handicaps, setHandicaps] = useState<{ handicap9: number; handicap18: number }>(() => {
    const cached = getCachedHandicap(userKey);
    if (cached) return cached;
    return {
      handicap9: profile9,
      handicap18: profile18,
    };
  });

  const lastKeyRef = useRef<string>(userKey);

  useEffect(() => {
    let cancelled = false;

    // Si cambia de usuario, recuperar la caché del nuevo usuario sin parpadeo
    if (userKey !== lastKeyRef.current) {
      lastKeyRef.current = userKey;
      const cached = getCachedHandicap(userKey);
      if (cached) {
        setHandicaps(cached);
      } else {
        setHandicaps({ handicap9: profile9, handicap18: profile18 });
      }
    }

    if (!userId && !profile?.nick) return;

    golfService.getLatestNonTeamPlayingHandicap({
      userId: userId || undefined,
      nick: profile?.nick,
      displayName: profile?.display_name,
    }).then(result => {
      if (cancelled) return;
      if (result) {
        if (userKey) {
          handicapMemoryCache.set(userKey, result);
          try {
            window.sessionStorage?.setItem(`playing_hcp_${userKey}`, JSON.stringify(result));
          } catch {}
        }
        setHandicaps(prev => {
          if (prev.handicap9 === result.handicap9 && prev.handicap18 === result.handicap18) {
            return prev;
          }
          return result;
        });
      } else {
        // Si no hay partidas previas y no teníamos caché, sincronizar con el perfil
        const cached = getCachedHandicap(userKey);
        if (!cached) {
          setHandicaps(prev => {
            if (prev.handicap9 === profile9 && prev.handicap18 === profile18) return prev;
            return { handicap9: profile9, handicap18: profile18 };
          });
        }
      }
    }).catch(err => {
      console.warn('Error loading latest handicap:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [userId, profile?.nick, profile?.display_name, profile?.exact_handicap, userKey, profile9, profile18]);

  return handicaps;
}
