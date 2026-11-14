import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '../../lib/errors';
import { objectDetailQuery, useObjectPanels, invalidateObject } from '../../data/objectDetail';
import { useTaxonomy } from '../../data/taxonomy';
import { qk } from '../../data/keys';
import type {
  ObjectRow, Named, OutgoingLink, IncomingLink, FileRow, VersionRow, PromptTemplate, PromptRun,
  SuggestedTag, SuggestedLink, LinkTarget, ListSetter,
} from './types';

type Panels = ReturnType<typeof useObjectPanels>;
export type PanelName = keyof Panels | 'taxonomy';
type ObjectSetter = (next: ObjectRow | null | ((prev: ObjectRow) => ObjectRow)) => void;

/**
 * Loads a knowledge object and its panels through the query cache.
 * Panels report their own errors (`panelErrors`) and can be retried one at a time (`retryPanel`).
 */
export function useObjectPage({ id, userId }: { id?: string; userId?: string }) {
  const client = useQueryClient();
  const objectQ = useQuery({ ...objectDetailQuery(id ?? ''), enabled: !!id && !!userId });
  const raw = (objectQ.data ?? null) as ObjectRow | null;
  const object = raw && !raw.is_deleted ? raw : null;
  const panels = useObjectPanels(id, userId, !!object);
  const taxonomy = useTaxonomy(object ? userId ?? null : null);
  const [actionError, setError] = useState('');

  // Owner perf check (hand-off): marks the open of each new object id.
  useEffect(() => {
    if (id) performance.mark('pks:object-open');
  }, [id]);

  const loadError = objectQ.error
    ? getErrorMessage(objectQ.error, 'Load failed')
    : objectQ.isSuccess && !raw ? "That item doesn't exist or was deleted."
    : raw?.is_deleted ? 'This object has been deleted' : '';

  // A setter over cached query data that behaves like a useState setter.
  const setter = useCallback(<T,>(key: readonly unknown[], field?: string): ListSetter<T> => (updater) => {
    client.setQueryData(key, (prev: unknown) => {
      const holder = prev as Record<string, unknown> | undefined;
      const current = (field ? holder?.[field] ?? [] : prev ?? []) as T[];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return field ? { ...(holder ?? {}), [field]: next } : next;
    });
  }, [client]);

  const oid = id ?? '';
  const setObject = useMemo(() => setter(qk.object.detail(oid)) as unknown as ObjectSetter, [setter, oid]);
  const reload = useCallback(() => invalidateObject(oid, client), [oid, client]);

  const panelErrors: Partial<Record<PanelName, unknown>> = {
    versions: panels.versions.error, domains: panels.domains.error, tags: panels.tags.error,
    links: panels.links.error, files: panels.files.error, runs: panels.runs.error, prompts: panels.prompts.error,
    taxonomy: taxonomy.error,
  };
  const retryPanel = useCallback((name: PanelName) => {
    if (name === 'taxonomy') return taxonomy.refetch();
    return panels[name]?.refetch();
  }, [panels, taxonomy]);

  return {
    object,
    setObject,
    loading: !!id && !!userId && objectQ.isPending,
    error: actionError || loadError,
    setError,
    reload,
    versions: (panels.versions.data ?? []) as VersionRow[],
    setVersions: setter<VersionRow>(qk.object.versions(oid)),
    objectDomains: (panels.domains.data ?? []) as Named[],
    setObjectDomains: setter<Named>(qk.object.domains(oid)),
    objectTags: (panels.tags.data ?? []) as Named[],
    setObjectTags: setter<Named>(qk.object.tags(oid)),
    allDomains: taxonomy.domains as Named[],
    allTags: taxonomy.tags as Named[],
    outgoingLinks: (panels.links.data?.outgoing ?? []) as OutgoingLink[],
    setOutgoingLinks: setter<OutgoingLink>(qk.object.links(oid), 'outgoing'),
    incomingLinks: (panels.links.data?.incoming ?? []) as IncomingLink[],
    setIncomingLinks: setter<IncomingLink>(qk.object.links(oid), 'incoming'),
    otherObjects: (panels.linkCandidates.data ?? []) as LinkTarget[],
    attachedFiles: (panels.files.data ?? []) as FileRow[],
    setAttachedFiles: setter<FileRow>(qk.object.files(oid)),
    promptTemplates: (panels.prompts.data ?? []) as PromptTemplate[],
    promptRuns: (panels.runs.data ?? []) as PromptRun[],
    setPromptRuns: setter<PromptRun>(qk.object.runs(oid)),
    suggestedTags: (panels.suggestedTags.data ?? []) as SuggestedTag[],
    suggestedLinkedObjects: (panels.suggestedLinks.data ?? []) as SuggestedLink[],
    myShare: (panels.myShare.data ?? null) as { id: string; role: string } | null,
    panelErrors,
    retryPanel,
  };
}
