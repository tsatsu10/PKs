import { queryOptions } from '@tanstack/react-query';
import { db } from './client';
import { fetchAll } from './fetchAll';
import { qk } from './keys';

// output_format is excluded on purpose: −1B2 Task 10 drops the column.
export const PROMPT_COLS = 'id, name, description, applies_to_types, prompt_text, tags, created_at, updated_at';
export type PromptRow = { id: string; name: string; description: string | null; applies_to_types: string[] | null; prompt_text: string; tags: string[] | null; created_at: string; updated_at: string };

export const fetchPrompts = (userId: string) =>
  fetchAll<PromptRow>((from, to) => db.from('prompt_templates').select(PROMPT_COLS).eq('user_id', userId)
    .order('name').order('id').range(from, to));

export const promptsQuery = (userId: string) => queryOptions({ queryKey: qk.prompts.list(), queryFn: () => fetchPrompts(userId) });
