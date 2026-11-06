import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database, Tables } from './database.types';

/** The app's single Supabase client, typed with the generated schema. Use only inside src/data. */
export const db = supabase as unknown as SupabaseClient<Database>;
export type { Database, Tables };
