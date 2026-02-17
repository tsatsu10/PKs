import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// Singleton: reuse client across HMR/Strict Mode
const GLOBAL_KEY = '__PKS_SUPABASE_CLIENT__';

// Bypass Navigator Lock to avoid "AbortError: signal is aborted without reason"
// (see https://github.com/supabase/supabase-js/issues/936)
const noOpLock = (_name, _timeout, fn) => fn();

export const supabase =
  globalThis[GLOBAL_KEY] ??
  (globalThis[GLOBAL_KEY] = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { lock: noOpLock },
  }));
