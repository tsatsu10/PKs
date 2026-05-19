import { createContext, useContext, useMemo } from 'react';
import { useObjectLinksBatch } from '../hooks/useObjectLinksBatch';

const LinkedObjectsContext = createContext(null);

export function LinkedObjectsProvider({ userId, scrollRootRef, children }) {
  const { registerVisible, getLinksFor } = useObjectLinksBatch(userId);

  const value = useMemo(
    () => ({ registerVisible, getLinksFor, scrollRootRef }),
    [registerVisible, getLinksFor, scrollRootRef]
  );

  return (
    <LinkedObjectsContext.Provider value={value}>
      {children}
    </LinkedObjectsContext.Provider>
  );
}

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
