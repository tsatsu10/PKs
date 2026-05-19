import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

const FETCH_DEBOUNCE_MS = 120;

/**
 * Batched link lookup for visible dashboard rows.
 * @param {string | null} userId
 */
export function useObjectLinksBatch(userId) {
  const [linksByObject, setLinksByObject] = useState(/** @type {Record<string, { links: object[], total: number }>} */ ({}));
  const pendingIdsRef = useRef(new Set());
  const visibleIdsRef = useRef(new Set());
  const timerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const cacheRef = useRef(/** @type {Record<string, { links: object[], total: number }>} */ ({}));

  const flushFetch = useCallback(async () => {
    const ids = [...pendingIdsRef.current].filter((id) => !cacheRef.current[id]);
    pendingIdsRef.current.clear();
    if (!userId || ids.length === 0) return;

    const { data, error } = await supabase.rpc('get_object_links_batch', {
      p_object_ids: ids,
      p_limit_per: 3,
    });

    if (error || !data) return;

    const next = { ...cacheRef.current };
    for (const id of ids) {
      const entry = data[id];
      next[id] = entry
        ? { links: entry.links ?? [], total: Number(entry.total) || 0 }
        : { links: [], total: 0 };
    }
    cacheRef.current = next;
    setLinksByObject({ ...next });
  }, [userId]);

  const scheduleFetch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushFetch();
    }, FETCH_DEBOUNCE_MS);
  }, [flushFetch]);

  const registerVisible = useCallback((objectId, isVisible) => {
    if (!objectId) return;
    if (isVisible) {
      visibleIdsRef.current.add(objectId);
      if (!cacheRef.current[objectId]) {
        pendingIdsRef.current.add(objectId);
        scheduleFetch();
      }
    } else {
      visibleIdsRef.current.delete(objectId);
    }
  }, [scheduleFetch]);

  const getLinksFor = useCallback((objectId) => {
    return linksByObject[objectId] ?? cacheRef.current[objectId] ?? null;
  }, [linksByObject]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    cacheRef.current = {};
    pendingIdsRef.current.clear();
    visibleIdsRef.current.clear();
    setLinksByObject({});
  }, [userId]);

  return { registerVisible, getLinksFor };
}
