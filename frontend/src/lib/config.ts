const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

/** Names of the Supabase build variables that are empty, so the app can say so instead of going blank. */
export function missingSupabaseConfig(env: Record<string, unknown> = import.meta.env): string[] {
  return REQUIRED.filter((name) => {
    const value = env[name];
    return typeof value !== 'string' || value.trim() === '';
  });
}
