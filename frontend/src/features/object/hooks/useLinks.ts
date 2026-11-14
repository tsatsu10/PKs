import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useNotifyError } from '../../../lib/useNotifyError';
import { invalidateObjectLists } from '../../../data/objects';
import { invalidateObject, searchLinkTargets } from '../../../data/objectDetail';
import type { ObjectRow, LinkTarget, OutgoingLink, IncomingLink, ListSetter, SetError } from '../types';

type Options = {
  object: ObjectRow | null;
  userId: string | undefined;
  otherObjects: LinkTarget[];
  outgoingLinks: OutgoingLink[];
  incomingLinks: IncomingLink[];
  setOutgoingLinks: ListSetter<OutgoingLink>;
  setIncomingLinks: ListSetter<IncomingLink>;
  setError: SetError;
};

/** Add and remove links, plus the header's link-search state (300 ms debounce, Escape / outside click close). */
export function useLinks({ object, userId, otherObjects, outgoingLinks, incomingLinks, setOutgoingLinks, setIncomingLinks, setError }: Options) {
  const notifyError = useNotifyError();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkTarget[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const objectId = object?.id;

  useEffect(() => {
    if (!query.trim() || !userId || !objectId) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setResults((await searchLinkTargets(query.trim())).filter((o) => o.id !== objectId));
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, userId, objectId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (!open) return;
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  async function addLink(toObjectId: string, relationshipType = 'references') {
    if (!object || !toObjectId) return;
    setError('');
    try {
      const { data, error: err } = await supabase.from('link_edges').insert({
        from_object_id: object.id,
        to_object_id: toObjectId,
        relationship_type: relationshipType,
      }).select('id, to_object_id, relationship_type').single();
      if (err) throw err;
      const target = otherObjects.find((o) => o.id === toObjectId);
      setOutgoingLinks((prev) => [...prev, { id: data.id, to_object_id: data.to_object_id, relationship_type: data.relationship_type, target: target || { id: toObjectId, title: '…', type: '' } }]);
      invalidateObject(toObjectId);
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to add link'));
    }
  }

  async function removeLink(edgeId: string, isOutgoing: boolean) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('link_edges').delete().eq('id', edgeId);
      if (err) throw err;
      const otherId = isOutgoing
        ? outgoingLinks.find((l) => l.id === edgeId)?.to_object_id
        : incomingLinks.find((l) => l.id === edgeId)?.from_object_id;
      if (isOutgoing) setOutgoingLinks((prev) => prev.filter((l) => l.id !== edgeId));
      else setIncomingLinks((prev) => prev.filter((l) => l.id !== edgeId));
      if (otherId) invalidateObject(otherId);
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to remove link'));
    }
  }

  return { addLink, removeLink, search: { query, setQuery, results, open, setOpen, containerRef } };
}
