import { effectivePlan } from '../utils/effectivePlan';
import React, { useEffect, useState, useRef } from 'react';
import { clearStoredAuthSession, supabase } from '../services/supabaseClient';
import { setAuthenticatedUserId } from '../utils/userId';
import { readExpressCredential } from '../utils/expressCredential';
import { storageUtils } from '../utils/storage';
import { authContext, UserSubscription } from './authContextValue';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUserId = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const [user, setUser] = useState<React.ContextType<typeof authContext>['user']>(null);
  const [session, setSession] = useState<React.ContextType<typeof authContext>['session']>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const claimedForUser = useRef<string | null>(null);
  const claimDeviceRoundsOnce = async (userId: string) => {
    const deviceId = readExpressCredential()?.ownerId;
    const claimKey = `${userId}:${deviceId}`;
    if (!deviceId || claimedForUser.current === claimKey) return;
    claimedForUser.current = claimKey;
    try {
      const { userService } = await import('../services/userService');
      await userService.claimDeviceRounds(deviceId);
    } catch (error) {
      claimedForUser.current = null;
      console.warn('No se han podido recuperar las partidas Express de este dispositivo:', error);
    }
  };

  const fetchSubscription = async (userId: string) => {
    const request = ++requestVersion.current;
    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('plan_type, status, current_period_end, team_trial_ends_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (currentUserId.current !== userId || request !== requestVersion.current) return;
      if (error) {
        console.error('Error cargando la suscripcion:', error);
        setSubscription(null);
      } else if (data) {
        setSubscription({
          planType: effectivePlan(data),
          status: data.status,
          currentPeriodEnd: data.current_period_end,
        });
      } else {
        setSubscription(null);
      }
    } catch (error) {
      if (currentUserId.current !== userId || request !== requestVersion.current) return;
      console.error('Error inesperado cargando la suscripcion:', error);
      setSubscription(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      currentUserId.current = currentSession?.user.id ?? null;
      setAuthenticatedUserId(currentSession?.user.id ?? null);
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) fetchSubscription(currentSession.user.id);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      currentUserId.current = currentSession?.user.id ?? null;
      setAuthenticatedUserId(currentSession?.user.id ?? null);
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        window.setTimeout(() => {
          void fetchSubscription(currentSession.user.id);
          void claimDeviceRoundsOnce(currentSession.user.id);
        }, 0);
      } else {
        setSubscription(null);
      }
      setLoading(false);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const check = () => { if (currentUserId.current) void fetchSubscription(currentUserId.current); };
    const timer = window.setInterval(check, 30000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    await clearStoredAuthSession();
    // A group is account-scoped UI context. Keeping it after logout can make
    // the anonymous Express screen query rounds from the previous account's
    // group and then offer actions that the Express identity cannot perform.
    storageUtils.clearCurrentGroup();
    currentUserId.current = null;
    setAuthenticatedUserId(null);
    setUser(null);
    setSession(null);
    setSubscription(null);
  };

  const refreshSubscription = async () => {
    if (user) await fetchSubscription(user.id);
  };

  return (
    <authContext.Provider value={{ user, session, subscription, loading, logout, refreshSubscription }}>
      {children}
    </authContext.Provider>
  );
};
