import { UserProfile } from '../types';

// El HCP mostrado procede exclusivamente de los datos guardados del perfil.
export function useLatestPlayingHandicap(
  _userId?: string | null,
  profile?: UserProfile | null,
  _currentView?: string
) {
  const handicap18 = profile?.exact_handicap ?? 0;
  return {
    handicap18,
    handicap9: Math.round(handicap18 / 2),
  };
}
