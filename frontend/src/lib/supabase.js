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

// Password recovery: /reset-password may only change the password when this tab arrived via a
// recovery link, not merely because some session exists. Detect it at module load so the
// PASSWORD_RECOVERY event (fired while the client initializes) is never missed.
const PASSWORD_RECOVERY_KEY = 'pks-password-recovery';

function markPasswordRecovery() {
  try { sessionStorage.setItem(PASSWORD_RECOVERY_KEY, '1'); } catch { /* ignore */ }
}

export function isPasswordRecovery() {
  try { return sessionStorage.getItem(PASSWORD_RECOVERY_KEY) === '1'; } catch { return false; }
}

export function clearPasswordRecovery() {
  try { sessionStorage.removeItem(PASSWORD_RECOVERY_KEY); } catch { /* ignore */ }
}

if (typeof window !== 'undefined' && /(?:^|[#&?])type=recovery(?:&|$)/.test(window.location.hash + window.location.search)) {
  markPasswordRecovery();
}
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') markPasswordRecovery();
});
