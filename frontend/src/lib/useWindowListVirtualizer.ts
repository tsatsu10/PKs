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
  const empty = count === 0;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const measure = () => setScrollMargin(Math.round(el.getBoundingClientRect().top + window.scrollY));
    measure();
    window.addEventListener('resize', measure);
    // Content above the list (filters, banners) changes height without a window resize.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [listRef, empty]);

  const virtualizer = useWindowVirtualizer({ count, estimateSize, overscan, scrollMargin });
  return { virtualizer, scrollMargin };
}
