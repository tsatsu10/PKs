import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDraft, DRAFT_KEYS } from '../lib/draftStorage';
import { getErrorMessage } from '../lib/errors';
import { objectDetailQuery, useObjectPanels, invalidateObject } from '../data/objectDetail';
import { useTaxonomy } from '../data/taxonomy';
import { qk } from '../data/keys';

/**
 * Loads a knowledge object and its panels through the query cache.
 * Same return shape as before, plus panelErrors / retryPanel for per-panel error states (R10).
 * @param {{ id: string | undefined, userId: string | undefined }} options
 */
export function useObjectDetail({ id, userId }) {
  const client = useQueryClient();
  const objectQ = useQuery({ ...objectDetailQuery(id ?? ''), enabled: !!id && !!userId });
  const raw = objectQ.data ?? null;
  const object = raw && !raw.is_deleted ? raw : null;
  const panels = useObjectPanels(id, userId, !!object);
  const taxonomy = useTaxonomy(object ? userId : null);
  const [actionError, setError] = useState('');

  const loadError = objectQ.error
    ? getErrorMessage(objectQ.error, 'Load failed')
    : objectQ.isSuccess && !raw ? "That item doesn't exist or was deleted."
    : raw?.is_deleted ? 'This object has been deleted' : '';

  const setter = useCallback((key, field) => (updater) => {
    client.setQueryData(key, (/** @type {any} */ prev) => {
      const current = field ? prev?.[field] ?? [] : prev ?? [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return field ? { ...(prev ?? {}), [field]: next } : next;
    });
  }, [client]);

  const oid = id ?? '';
  const setObject = useMemo(() => setter(qk.object.detail(oid)), [setter, oid]);
  const reload = useCallback(() => invalidateObject(oid, client), [oid, client]);
  const draft = id ? getDraft(DRAFT_KEYS.object(id)) : null;

  const panelErrors = {
    versions: panels.versions.error, domains: panels.domains.error, tags: panels.tags.error,
    links: panels.links.error, files: panels.files.error, runs: panels.runs.error, prompts: panels.prompts.error,
    taxonomy: taxonomy.error,
  };
  const retryPanel = useCallback((name) => {
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
    draft,
    versions: panels.versions.data ?? [],
    setVersions: setter(qk.object.versions(oid)),
    objectDomains: panels.domains.data ?? [],
    setObjectDomains: setter(qk.object.domains(oid)),
    objectTags: panels.tags.data ?? [],
    setObjectTags: setter(qk.object.tags(oid)),
    allDomains: taxonomy.domains,
    allTags: taxonomy.tags,
    outgoingLinks: panels.links.data?.outgoing ?? [],
    setOutgoingLinks: setter(qk.object.links(oid), 'outgoing'),
    incomingLinks: panels.links.data?.incoming ?? [],
    setIncomingLinks: setter(qk.object.links(oid), 'incoming'),
    otherObjects: panels.linkCandidates.data ?? [],
    attachedFiles: panels.files.data ?? [],
    setAttachedFiles: setter(qk.object.files(oid)),
    promptTemplates: panels.prompts.data ?? [],
    promptRuns: panels.runs.data ?? [],
    setPromptRuns: setter(qk.object.runs(oid)),
    suggestedTags: panels.suggestedTags.data ?? [],
    suggestedLinkedObjects: panels.suggestedLinks.data ?? [],
    myShare: panels.myShare.data ?? null,
    panelErrors,
    retryPanel,
  };
}
