import { createClient } from '@supabase/supabase-js';
import { persistentAuthStorage, authStorageKey, clearPersistentAuthSession } from './tabAuthStorage';
import { expressCredentialFetch } from '../utils/expressCredential';
import { timeoutFetch } from '../utils/timeoutFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
  });
  throw new Error('Supabase URL and Anon Key are required. Please check your .env file.');
}

let supabaseClient;

try {
  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: expressCredentialFetch(supabaseUrl, timeoutFetch()) },
    auth: {
      storage: persistentAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: authStorageKey,
    },
  });
} catch (error) {
  console.error('Error creating Supabase client:', error);
  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: expressCredentialFetch(supabaseUrl, timeoutFetch()) },
    auth: {
      storage: persistentAuthStorage,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: authStorageKey,
    },
  });
}

export const supabase = supabaseClient;

export const clearStoredAuthSession = clearPersistentAuthSession;
