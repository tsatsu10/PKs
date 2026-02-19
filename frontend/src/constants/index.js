/**
 * Shared constants for PKS frontend.
 * Keeps types and event names in sync with backend (Supabase enums / webhook-deliver).
 */

/** Knowledge object types (must match DB enum knowledge_object_type) */
export const OBJECT_TYPES = [
  'note',
  'document',
  'sop',
  'report',
  'proposal',
  'guideline',
  'insight',
  'template',
  'concept',
  'tool',
  'incident',
  'case',
  'research_paper',
  'decision',
  'prompt',
];

/** Icons for object types (emoji for quick visual recognition) */
export const OBJECT_TYPE_ICONS = {
  note: '📝',
  document: '📄',
  sop: '📋',
  report: '📊',
  proposal: '📑',
  guideline: '📌',
  insight: '💡',
  template: '📐',
  concept: '🧩',
  tool: '🔧',
  incident: '⚠️',
  case: '📁',
  research_paper: '📚',
  decision: '✓',
  prompt: '💬',
};

/** Integration types (stored in integrations.type) */
export const INTEGRATION_TYPES = ['generic', 'import', 'webhook', 'api'];

/** Webhook event ids and labels (used by webhook-deliver Edge Function) */
export const WEBHOOK_EVENTS = [
  { id: 'object.created', label: 'Object created' },
  { id: 'prompt_run.completed', label: 'Prompt run completed' },
  { id: 'export.completed', label: 'Export completed' },
];

/** Audit log action values (stored in audit_logs.action) */
export const AUDIT_ACTIONS = {
  OBJECT_CREATE: 'object_create',
  OBJECT_UPDATE: 'object_update',
  OBJECT_DELETE: 'object_delete',
  PROMPT_RUN: 'prompt_run',
  EXPORT_RUN: 'export_run',
};

/** Entity types for audit logs (audit_logs.entity_type) */
export const AUDIT_ENTITY_TYPES = {
  KNOWLEDGE_OBJECT: 'knowledge_object',
  PROMPT_RUN: 'prompt_run',
  EXPORT_JOB: 'export_job',
};

/** Ordered list of audit action values for filter dropdowns (matches audit_logs.action) */
export const AUDIT_ACTION_LIST = [
  'object_create',
  'object_update',
  'object_delete',
  'prompt_run',
  'export_run',
];

/** SessionStorage key for "use prompt on object" flow from Prompt Bank */
export const RUN_PROMPT_STORAGE_KEY = 'pks_run_prompt_template';
