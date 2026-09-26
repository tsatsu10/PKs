import { createContext, useContext } from 'react';

export const LinkedObjectsContext = createContext(null);

export function useLinkedObjects() {
  const ctx = useContext(LinkedObjectsContext);
  if (!ctx) {
    throw new Error('useLinkedObjects must be used within LinkedObjectsProvider');
  }
  return ctx;
}

/** Optional hook for rows outside provider (returns no-op). */
export function useLinkedObjectsOptional() {
  return useContext(LinkedObjectsContext);
}
