import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';

export interface UserSubscription {
  planType: string;
  status: string;
  currentPeriodEnd?: string | null;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  subscription: UserSubscription | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

export const authContext = createContext<AuthContextValue>({} as AuthContextValue);
