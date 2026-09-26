import { useMemo } from 'react';
import { useObjectLinksBatch } from '../hooks/useObjectLinksBatch';
import { LinkedObjectsContext } from './linkedObjectsHooks';

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
