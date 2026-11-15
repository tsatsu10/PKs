import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useNotifyError } from '../../../lib/useNotifyError';
import { invalidateObjectLists } from '../../../data/objects';
import { optimistic } from '../../../data/optimistic';
import { qk } from '../../../data/keys';
import { useUndoToast } from './useUndoToast';
import type { ObjectRow, Named, SetError } from '../types';

type Options = {
  object: ObjectRow | null;
  allDomains: Named[];
  allTags: Named[];
  setError: SetError;
};

type Kind = 'domain' | 'tag';
const byName = (a: Named, b: Named) => a.name.localeCompare(b.name);
const TABLE = { domain: 'knowledge_object_domains', tag: 'knowledge_object_tags' } as const;
const COLUMN = { domain: 'domain_id', tag: 'tag_id' } as const;
const LABEL = { domain: 'Domain', tag: 'Tag' } as const;

/** Add and remove the object's domains and tags: applied at once, rolled back on failure; removals offer Undo. */
export function useTaxonomyActions({ object, allDomains, allTags, setError }: Options) {
  const client = useQueryClient();
  const notifyError = useNotifyError();
  const undoToast = useUndoToast();

  /** Optimistically add or remove one domain/tag of object `oid`. Throws on failure, after rolling back. */
  async function change(kind: Kind, oid: string, entityId: string, add: boolean) {
    const key = kind === 'domain' ? qk.object.domains(oid) : qk.object.tags(oid);
    const item = (kind === 'domain' ? allDomains : allTags).find((x) => x.id === entityId);
    await optimistic(client, {
      keys: [{ queryKey: key, exact: true }],
      apply: () => client.setQueryData<Named[]>(key, (prev = []) => {
        const rest = prev.filter((x) => x.id !== entityId);
        return add ? (item ? [...rest, item].sort(byName) : prev) : rest;
      }),
      run: async () => {
        const row = { knowledge_object_id: oid, [COLUMN[kind]]: entityId };
        const { error } = add
          ? await supabase.from(TABLE[kind]).insert(row)
          : await supabase.from(TABLE[kind]).delete().eq('knowledge_object_id', oid).eq(COLUMN[kind], entityId);
        if (error) throw error;
      },
    });
    void invalidateObjectLists();
  }

  async function add(kind: Kind, entityId: string) {
    if (!object) return;
    setError('');
    try {
      await change(kind, object.id, entityId, true);
    } catch (err) {
      setError(notifyError(err, `Failed to add ${kind}`));
    }
  }

  async function remove(kind: Kind, entityId: string) {
    if (!object) return;
    setError('');
    const oid = object.id;
    const pending = change(kind, oid, entityId, false);
    const withdraw = undoToast(`${LABEL[kind]} removed`, () => change(kind, oid, entityId, true));
    try {
      await pending;
    } catch (err) {
      withdraw();
      setError(notifyError(err, `Failed to remove ${kind}`));
    }
  }

  return {
    addDomain: (id: string) => add('domain', id),
    removeDomain: (id: string) => remove('domain', id),
    addTag: (id: string) => add('tag', id),
    removeTag: (id: string) => remove('tag', id),
  };
}
