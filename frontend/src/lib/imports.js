import { supabase } from './supabase';

/**
 * Before creating an object from an import: check if we already have one for this source.
 * @param {string} [integrationId] - integration uuid or null for generic
 * @param {string} sourceIdentifier - external id (e.g. URL, notion page id)
 * @returns {Promise<string|null>} - existing knowledge_object_id or null
 */
export async function getExistingObjectForImport(integrationId, sourceIdentifier) {
  const { data, error } = await supabase.rpc('import_get_existing_object', {
    p_integration_id: integrationId || null,
    p_source_identifier: String(sourceIdentifier),
  });
  if (error) {
    console.warn('import_get_existing_object failed:', error);
    return null;
  }
  return data || null;
}

/**
 * After creating a knowledge object from an import: register it for deduplication.
 * @param {string} knowledgeObjectId - the new or updated object id
 * @param {string} [integrationId]
 * @param {string} sourceIdentifier
 * @param {object} [payload] - optional metadata
 */
export async function registerImport(knowledgeObjectId, integrationId, sourceIdentifier, payload = {}) {
  const { error } = await supabase.rpc('import_register', {
    p_integration_id: integrationId || null,
    p_source_identifier: String(sourceIdentifier),
    p_knowledge_object_id: knowledgeObjectId,
    p_payload: payload,
  });
  if (error) console.warn('import_register failed:', error);
}
