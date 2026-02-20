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
  'bookmark',
  'meeting_notes',
  'quote',
  'recipe',
  'person',
  'howto',
];

/** Object status (must match DB CHECK: draft, active, archived) */
export const OBJECT_STATUSES = ['draft', 'active', 'archived'];

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
  bookmark: '🔖',
  meeting_notes: '📅',
  quote: '〝',
  recipe: '🍳',
  person: '👤',
  howto: '📖',
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

/**
 * AI/LLM models for "Run prompt". provider = 'openai' | 'deepseek'; must match allowlist in supabase/functions/run-prompt.
 */
export const AI_MODELS = [
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini (fast)', provider: 'openai' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai' },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano', provider: 'openai' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'gpt-4o-nano', label: 'GPT-4o nano', provider: 'openai' },
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'openai' },
  { id: 'deepseek-chat', label: 'DeepSeek Chat', provider: 'deepseek' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', provider: 'deepseek' },
];

export const OPENAI_MODEL_IDS = AI_MODELS.filter((m) => m.provider === 'openai').map((m) => m.id);
export const DEEPSEEK_MODEL_IDS = AI_MODELS.filter((m) => m.provider === 'deepseek').map((m) => m.id);
