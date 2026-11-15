import { describe, it, expect } from 'vitest';
import { missingSupabaseConfig } from './config';

describe('missingSupabaseConfig', () => {
  it('names each empty Supabase variable', () => {
    expect(missingSupabaseConfig({})).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
    expect(missingSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: '' }))
      .toEqual(['VITE_SUPABASE_ANON_KEY']);
    expect(missingSupabaseConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual(['VITE_SUPABASE_URL']);
    expect(missingSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual([]);
  });
});
