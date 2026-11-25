import { describe, it, expect, vi, afterEach } from 'vitest';
import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { useWindowListVirtualizer } from './useWindowListVirtualizer';

afterEach(() => { vi.restoreAllMocks(); });

/** Like the dashboard: the list element only exists once loading ends, and `count` may not change. */
function Harness({ loading, count }: { loading: boolean; count: number }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const { scrollMargin } = useWindowListVirtualizer({ listRef, count, estimateSize: () => 300, overscan: 3 });
  return (
    <>
      <output data-testid="margin">{scrollMargin}</output>
      {!loading && <div ref={listRef} data-testid="list" />}
    </>
  );
}

describe('useWindowListVirtualizer', () => {
  it('measures the list when it mounts after the first render, even if count never changes', () => {
    // Card view reports at least one row while loading, so "count became non-zero" never fires.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.testid === 'list' ? 640 : 0;
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
    const { rerender } = render(<Harness loading count={1} />);
    expect(screen.getByTestId('margin')).toHaveTextContent('0');
    rerender(<Harness loading={false} count={1} />);
    expect(screen.getByTestId('margin')).toHaveTextContent('640');
  });

  it('re-measures when the list element is replaced', () => {
    let top = 200;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const t = this.dataset.testid === 'list' ? top : 0;
      return { top: t, bottom: t, left: 0, right: 0, width: 0, height: 0, x: 0, y: t, toJSON: () => ({}) } as DOMRect;
    });
    const { rerender } = render(<Harness loading={false} count={5} />);
    expect(screen.getByTestId('margin')).toHaveTextContent('200');
    rerender(<Harness loading count={5} />);
    top = 480;
    rerender(<Harness loading={false} count={5} />);
    expect(screen.getByTestId('margin')).toHaveTextContent('480');
  });
});
