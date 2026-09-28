import { createContext, useContext } from 'react';

export const LinkedObjectsContext = createContext(null);

/** Optional hook for rows outside provider (returns no-op). */
export function useLinkedObjectsOptional() {
  return useContext(LinkedObjectsContext);
}
