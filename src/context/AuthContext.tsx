import { effectivePlan } from '../utils/effectivePlan';
// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { setAuthenticatedUserId } from '../utils/userId';

export interface UserSubscription {
  planType: string;
  status: string;
  currentPeriodEnd?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  subscription: UserSubscription | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUserId = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
      if (currentSession?.user) {
        fetchSubscription(currentSession.user.id);
      }
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        currentUserId.current = currentSession?.user.id ?? null;
        setAuthenticatedUserId(currentSession?.user.id ?? null);
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Supabase advises against awaiting another Supabase request inside
          // onAuthStateChange: it can hold the auth lock and block subsequent
          // queries (including the golf-course list). Run it after the callback.
          window.setTimeout(() => {
            void fetchSubscription(currentSession.user.id);
          }, 0);
        } else {
          setSubscription(null);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const check = () => { if (currentUserId.current) void fetchSubscription(currentUserId.current); };
    const timer = window.setInterval(check, 30000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    currentUserId.current = null;
    setAuthenticatedUserId(null);
    setUser(null);
    setSession(null);
    setSubscription(null);
  };

  const refreshSubscription = async () => {
    if (user) {
      await fetchSubscription(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, subscription, loading, logout, refreshSubscription }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
