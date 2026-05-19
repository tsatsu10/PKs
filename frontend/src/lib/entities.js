import { supabase } from './supabase';
import { getErrorMessage } from './errors';

const MAX_NAME_LEN = 120;

function normalizeEntityName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) {
    throw new Error('Name is required');
  }
  if (trimmed.length > MAX_NAME_LEN) {
    throw new Error(`Name must be ${MAX_NAME_LEN} characters or fewer`);
  }
  return trimmed;
}

/**
 * Create a domain via RPC (idempotent on name per user).
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function createDomain(name) {
  const normalized = normalizeEntityName(name);
  const { data, error } = await supabase.rpc('create_domain', { p_name: normalized });
  if (error) throw new Error(getErrorMessage(error, 'Could not create domain'));
  if (!data?.id) throw new Error('Could not create domain');
  return { id: data.id, name: data.name ?? normalized };
}

/**
 * Create a tag via RPC (idempotent on name per user).
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function createTag(name) {
  const normalized = normalizeEntityName(name);
  const { data, error } = await supabase.rpc('create_tag', { p_name: normalized });
  if (error) throw new Error(getErrorMessage(error, 'Could not create tag'));
  if (!data?.id) throw new Error('Could not create tag');
  return { id: data.id, name: data.name ?? normalized };
}
