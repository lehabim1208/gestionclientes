import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'undefined' || supabaseAnonKey === 'undefined') {
  console.warn('Supabase credentials are missing or undefined. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment secrets.');
}

// Ensure the client is created even if keys are missing to avoid immediate crashes, 
// but it will fail gracefully on actual requests.
export const supabase = createClient(
  supabaseUrl && supabaseUrl !== 'undefined' ? supabaseUrl : 'https://placeholder.supabase.co', 
  supabaseAnonKey && supabaseAnonKey !== 'undefined' ? supabaseAnonKey : 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      // Use a simple lock implementation to avoid Navigator LockManager timeouts in iframes
      lock: async (_name, _timeout, fn) => {
        // Just execute the function immediately without using the browser's LockManager
        return await fn();
      }
    }
  }
);
