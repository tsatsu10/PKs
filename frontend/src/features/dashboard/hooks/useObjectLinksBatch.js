import { useState, useEffect, useRef, useCallback } from 'react';
import { reportError } from '../../../lib/reportError';
import { fetchObjectLinksBatch } from '../../../data/dashboard';

const FETCH_DEBOUNCE_MS = 120;

/**
 * Batched link lookup for visible dashboard rows.
 * @param {string | null} userId
 */
export function useObjectLinksBatch(userId) {
  // Keyed by userId so a user switch never serves the previous user's links.
  const [linksState, setLinksState] = useState(/** @type {{ userId: string | null, map: Record<string, { links: object[], total: number }> }} */ ({ userId: null, map: {} }));
  const activeUserRef = useRef(userId);
  const pendingIdsRef = useRef(new Set());
  const visibleIdsRef = useRef(new Set());
  const timerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const cacheRef = useRef(/** @type {Record<string, { links: object[], total: number }>} */ ({}));

  const flushFetch = useCallback(async () => {
    const ids = [...pendingIdsRef.current].filter((id) => !cacheRef.current[id]);
    pendingIdsRef.current.clear();
    if (!userId || ids.length === 0) return;

    let map;
    try {
      map = await fetchObjectLinksBatch(ids);
    } catch (e) {
      reportError(e);
      return;
    }
    if (activeUserRef.current !== userId) return;

    const next = { ...cacheRef.current };
    for (const id of ids) {
      next[id] = map[id] ?? { links: [], total: 0 };
    }
    cacheRef.current = next;
    setLinksState({ userId, map: { ...next } });
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

  const linksByObject = linksState.userId === userId ? linksState.map : null;
  const getLinksFor = useCallback((objectId) => {
    if (!linksByObject) return null;
    return linksByObject[objectId] ?? cacheRef.current[objectId] ?? null;
  }, [linksByObject]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    activeUserRef.current = userId;
    cacheRef.current = {};
    pendingIdsRef.current.clear();
    visibleIdsRef.current.clear();
  }, [userId]);

  return { registerVisible, getLinksFor };
}
