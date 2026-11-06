import { useQueryClient } from '@tanstack/react-query';
import { prefetchObject } from './objectDetail';

/** Spread onto a link to an object: warms the object query on hover or keyboard focus. */
export function usePrefetchObject() {
  const client = useQueryClient();
  return (id: string) => ({ onMouseEnter: () => prefetchObject(id, client), onFocus: () => prefetchObject(id, client) });
}
