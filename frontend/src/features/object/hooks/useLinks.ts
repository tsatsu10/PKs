import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useNotifyError } from '../../../lib/useNotifyError';
import { invalidateObjectLists } from '../../../data/objects';
import { invalidateObject, searchLinkTargets } from '../../../data/objectDetail';
import { useQueryClient } from '@tanstack/react-query';
import { optimistic } from '../../../data/optimistic';
import { qk } from '../../../data/keys';
import { useUndoToast } from './useUndoToast';
import type { ObjectRow, LinkTarget, OutgoingLink, IncomingLink, SetError } from '../types';

type Options = {
  object: ObjectRow | null;
  userId: string | undefined;
  otherObjects: LinkTarget[];
  setError: SetError;
};

/**
 * Add and remove links (applied at once, rolled back on failure; removal offers Undo), plus the
 * header's link-search state (300 ms debounce, Escape / outside click close).
 */
export function useLinks({ object, userId, otherObjects, setError }: Options) {
  const client = useQueryClient();
  const notifyError = useNotifyError();
  const undoToast = useUndoToast();
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
        // link_edges INSERT (RLS) needs the target to be the user's own object, for owners and shared editors alike (B13).
        setResults((await searchLinkTargets(query.trim())).filter((o) => o.id !== objectId && o.user_id === userId));
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

  type Links = { outgoing: OutgoingLink[]; incoming: IncomingLink[] };
  type Edge = { from: string; to: string; type: string };

  /**
   * Optimistically put `link` into object `oid`'s cached links (outgoing or incoming), insert the edge,
   * and swap in the real id. Throws after rolling back.
   */
  async function insertEdge(oid: string, edge: Edge, outgoing: boolean, link: OutgoingLink | IncomingLink) {
    const key = qk.object.links(oid);
    const side = outgoing ? 'outgoing' : 'incoming';
    const data = await optimistic(client, {
      keys: [{ queryKey: key, exact: true }],
      apply: () => client.setQueryData<Links>(key, (prev) => ({
        outgoing: prev?.outgoing ?? [], incoming: prev?.incoming ?? [],
        [side]: [...(prev?.[side] ?? []), link],
      } as Links)),
      run: async () => {
        const { data: row, error: err } = await supabase.from('link_edges')
          .insert({ from_object_id: edge.from, to_object_id: edge.to, relationship_type: edge.type })
          .select('id').single();
        if (err) throw err;
        return row as { id: string };
      },
    });
    client.setQueryData<Links>(key, (prev) => prev && ({
      ...prev, [side]: (prev[side] as Array<{ id: string }>).map((l) => (l.id === link.id ? { ...l, id: data.id } : l)),
    } as Links));
    invalidateObject(outgoing ? edge.to : edge.from);
    void invalidateObjectLists();
  }

  async function addLink(toObjectId: string, relationshipType = 'references') {
    if (!object || !toObjectId) return;
    setError('');
    const target = otherObjects.find((o) => o.id === toObjectId) ?? { id: toObjectId, title: '…', type: '' };
    const link: OutgoingLink = { id: `tmp:${crypto.randomUUID()}`, to_object_id: toObjectId, relationship_type: relationshipType, target };
    try {
      await insertEdge(object.id, { from: object.id, to: toObjectId, type: relationshipType }, true, link);
    } catch (err) {
      setError(notifyError(err, 'Failed to add link'));
    }
  }

  async function removeLink(edgeId: string, isOutgoing: boolean) {
    if (!object) return;
    setError('');
    const oid = object.id;
    const key = qk.object.links(oid);
    const current = client.getQueryData<Links>(key);
    const link = (isOutgoing ? current?.outgoing : current?.incoming)?.find((l) => l.id === edgeId);
    const otherId = link ? ('to_object_id' in link ? link.to_object_id : link.from_object_id) : undefined;
    const pending = optimistic(client, {
      keys: [{ queryKey: key, exact: true }],
      apply: () => client.setQueryData<Links>(key, (prev) => prev && ({
        outgoing: isOutgoing ? prev.outgoing.filter((l) => l.id !== edgeId) : prev.outgoing,
        incoming: isOutgoing ? prev.incoming : prev.incoming.filter((l) => l.id !== edgeId),
      })),
      run: async () => {
        const { error: err } = await supabase.from('link_edges').delete().eq('id', edgeId);
        if (err) throw err;
      },
    });
    const withdraw = link && otherId
      ? undoToast('Link removed', () => insertEdge(oid, isOutgoing
        ? { from: oid, to: otherId, type: link.relationship_type }
        : { from: otherId, to: oid, type: link.relationship_type }, isOutgoing, link))
      : () => undefined;
    try {
      await pending;
      if (otherId) invalidateObject(otherId);
      void invalidateObjectLists();
    } catch (err) {
      withdraw();
      setError(notifyError(err, 'Failed to remove link'));
    }
  }

  return { addLink, removeLink, search: { query, setQuery, results, open, setOpen, containerRef } };
}
