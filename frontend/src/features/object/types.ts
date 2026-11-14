import type { Tables } from '../../data/client';

type ObjectColumns =
  | 'id' | 'user_id' | 'title' | 'content' | 'source' | 'summary' | 'key_points' | 'is_deleted'
  | 'current_version' | 'created_at' | 'updated_at' | 'is_pinned' | 'status' | 'slug' | 'cover_url'
  | 'due_at' | 'remind_at' | 'revision';

/** A knowledge object as the page reads it (`OBJECT_COLS` in data/objectDetail). */
export type ObjectRow = Pick<Tables<'knowledge_objects'>, ObjectColumns> & { type: string };

export type Named = { id: string; name: string };
export type LinkTarget = { id: string; title: string; type: string };
export type OutgoingLink = { id: string; to_object_id: string; relationship_type: string; target: LinkTarget };
export type IncomingLink = { id: string; from_object_id: string; relationship_type: string; source: LinkTarget };
export type FileRow = { id: string; filename: string; mime_type: string | null; size_bytes: number | null; storage_key?: string | null };
export type VersionRow = { id: string; version: number; title: string | null; created_at: string };
export type PromptTemplate = { id: string; name: string; prompt_text?: string | null; applies_to_types?: string[] | null };
export type PromptRun = { id: string; prompt_template_id: string | null; status: string; output: string | null; created_at: string };
export type SuggestedTag = { tag_id: string; tag_name: string; usage_count: number };
export type SuggestedLink = { id: string; title: string; type: string };

export type ExportInclude = Record<'content' | 'summary' | 'key_points' | 'tags' | 'domains' | 'links', boolean>;

/** The page-level error banner setter (`useObjectPage().setError`). */
export type SetError = (msg: string) => void;

/** A state setter over a cached list, like React's: a value or an updater. */
export type ListSetter<T> = (next: T[] | ((prev: T[]) => T[])) => void;
