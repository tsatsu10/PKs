import { useLayoutEffect, useState, type RefObject } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

interface Options {
  listRef: RefObject<HTMLElement | null>;
  count: number;
  estimateSize: (index: number) => number;
  overscan?: number;
}

/**
 * Virtualizes a list that scrolls with the page (no inner scroll box, M5). `scrollMargin` is the
 * list's distance from the top of the document; subtract it from each row's `start` when positioning.
 */
export function useWindowListVirtualizer({ listRef, count, estimateSize, overscan = 5 }: Options) {
  const [scrollMargin, setScrollMargin] = useState(0);
  // The list element mounts late (after loading) and is replaced when the list re-mounts, so the
  // measuring effect follows the element itself, not the row count.
  const [element, setElement] = useState<HTMLElement | null>(null);
  // Runs after every render on purpose: a ref's current value changes without notifying anyone.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (listRef.current !== element) setElement(listRef.current);
  });

  useLayoutEffect(() => {
    if (!element) return undefined;
    const measure = () => setScrollMargin(Math.round(element.getBoundingClientRect().top + window.scrollY));
    measure();
    window.addEventListener('resize', measure);
    // Content above the list (filters, banners) changes height without a window resize.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [element]);

  const virtualizer = useWindowVirtualizer({ count, estimateSize, overscan, scrollMargin });
  return { virtualizer, scrollMargin };
}
