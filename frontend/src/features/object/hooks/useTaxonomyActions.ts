import { supabase } from '../../../lib/supabase';
import { useNotifyError } from '../../../lib/useNotifyError';
import { invalidateObjectLists } from '../../../data/objects';
import type { ObjectRow, Named, ListSetter, SetError } from '../types';

type Options = {
  object: ObjectRow | null;
  allDomains: Named[];
  allTags: Named[];
  setObjectDomains: ListSetter<Named>;
  setObjectTags: ListSetter<Named>;
  setError: SetError;
};

const byName = (a: Named, b: Named) => a.name.localeCompare(b.name);

/** Add and remove the object's domains and tags. */
export function useTaxonomyActions({ object, allDomains, allTags, setObjectDomains, setObjectTags, setError }: Options) {
  const notifyError = useNotifyError();

  async function addDomain(domainId: string) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_domains').insert({ knowledge_object_id: object.id, domain_id: domainId });
      if (err) throw err;
      const d = allDomains.find((x) => x.id === domainId);
      if (d) setObjectDomains((prev) => [...prev, d].sort(byName));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to add domain'));
    }
  }

  async function removeDomain(domainId: string) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_domains').delete().eq('knowledge_object_id', object.id).eq('domain_id', domainId);
      if (err) throw err;
      setObjectDomains((prev) => prev.filter((d) => d.id !== domainId));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to remove domain'));
    }
  }

  async function addTag(tagId: string) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_tags').insert({ knowledge_object_id: object.id, tag_id: tagId });
      if (err) throw err;
      const t = allTags.find((x) => x.id === tagId);
      if (t) setObjectTags((prev) => [...prev, t].sort(byName));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to add tag'));
    }
  }

  async function removeTag(tagId: string) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_tags').delete().eq('knowledge_object_id', object.id).eq('tag_id', tagId);
      if (err) throw err;
      setObjectTags((prev) => prev.filter((t) => t.id !== tagId));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to remove tag'));
    }
  }

  return { addDomain, removeDomain, addTag, removeTag };
}
