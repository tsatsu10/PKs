import { useEffect, useRef } from 'react';
import { useLinkedObjectsOptional } from '../context/LinkedObjectsContext';

/**
 * Register a list row with the linked-objects batch loader when it enters the viewport.
 * @param {string} objectId
 */
export function useRowVisibility(objectId) {
  const rowRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const linked = useLinkedObjectsOptional();

  useEffect(() => {
    const el = rowRef.current;
    const register = linked?.registerVisible;
    const root = linked?.scrollRootRef?.current ?? null;
    if (!el || !register || !objectId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          register(objectId, entry.isIntersecting);
        }
      },
      { root, rootMargin: '80px', threshold: 0.05 }
    );

    observer.observe(el);
    return () => {
      register(objectId, false);
      observer.disconnect();
    };
  }, [objectId, linked?.registerVisible, linked?.scrollRootRef]);

  return rowRef;
}
