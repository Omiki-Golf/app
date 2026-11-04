import { useState, useEffect } from 'react';
import { golfService } from '../services/golfService';
import { UserProfile } from '../types';

export function useLatestPlayingHandicap(
  userId?: string | null,
  profile?: UserProfile | null,
  currentView?: string
) {
  const profile18 = profile?.exact_handicap !== undefined && profile?.exact_handicap !== null
    ? Math.round(profile.exact_handicap)
    : 0;
  const profile9 = Math.round(profile18 / 2);

  const [handicaps, setHandicaps] = useState<{ handicap9: number; handicap18: number }>({
    handicap9: profile9,
    handicap18: profile18,
  });

  useEffect(() => {
    let cancelled = false;

    setHandicaps({
      handicap9: profile9,
      handicap18: profile18,
    });

    if (!userId && !profile?.nick) return;

    golfService.getLatestNonTeamPlayingHandicap({
      userId: userId || undefined,
      nick: profile?.nick,
      displayName: profile?.display_name,
    }).then(result => {
      if (!cancelled && result) {
        setHandicaps(result);
      }
    }).catch(err => {
      console.warn('Error loading latest handicap:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [userId, profile?.nick, profile?.display_name, profile?.exact_handicap, currentView]);

  return handicaps;
}
