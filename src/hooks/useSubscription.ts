import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { userService } from '../services/userService';
import { PlanType, UserProfile } from '../types';

interface SubscriptionState {
  planType: PlanType;
  isPremium: boolean;
  loading: boolean;
  profile: UserProfile | null;
  refresh: () => Promise<void>;
}

export const useSubscription = (authenticatedUserId?: string | null): SubscriptionState => {
  const [planType, setPlanType] = useState<PlanType>('express');
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const { data: { user } } = await supabase.auth.getUser();
    if (version !== refreshVersion.current) return;
    if (!user || (authenticatedUserId !== undefined && user.id !== authenticatedUserId)) {
      setPlanType('express');
      setIsPremium(false);
      setProfile(null);
      setLoadedUserId(null);
      setLoading(false);
      return;
    }

    try {
      // ensureProfileFromMetadata already returns the existing or newly created profile.
      const p = await userService.ensureProfileFromMetadata(user.id, user.user_metadata || {});
      const plan = await userService.getPlanType(user.id);
      if (version !== refreshVersion.current) return;
      setProfile(p);
      setPlanType(plan);
      setIsPremium(plan !== 'express');
      setLoadedUserId(user.id);
    } catch (error) {
      if (version !== refreshVersion.current) return;
      console.error('Error cargando el perfil o la suscripcion:', error);
      setPlanType('express');
      setIsPremium(false);
      setLoadedUserId(null);
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, [authenticatedUserId]);

  useEffect(() => {
    void refresh();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        void refresh();
      }, 0);
    });

    const check = () => { void refresh(); };
    const timer = window.setInterval(check, 30000);
    window.addEventListener('focus', check);
    return () => {
      refreshVersion.current++;
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      authListener.subscription.unsubscribe();
    };
  }, [refresh]);

  const belongsToCurrentUser = authenticatedUserId === undefined || loadedUserId === authenticatedUserId;

  return {
    planType: belongsToCurrentUser ? planType : 'express',
    isPremium: belongsToCurrentUser ? isPremium : false,
    loading: loading || !belongsToCurrentUser,
    profile: belongsToCurrentUser ? profile : null,
    refresh,
  };
};
