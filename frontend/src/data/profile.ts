import { db } from './client';
import { unwrap } from './unwrap';

export const PROFILE_COLS = 'email, display_name, timezone, created_at';
export type ProfileRow = { email: string | null; display_name: string | null; timezone: string | null; created_at: string };

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  return unwrap(await db.from('users').select(PROFILE_COLS).eq('id', userId).maybeSingle()) as ProfileRow | null;
}
