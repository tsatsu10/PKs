import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect, useMemo, useRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardObjectList from './DashboardObjectList';
import { useWindowListVirtualizer } from '../../../lib/useWindowListVirtualizer';

vi.mock('../../../data/usePrefetchObject', () => ({ usePrefetchObject: () => () => ({}) }));

const makeObjects = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `obj-${i + 1}`,
    title: `Object ${i + 1}`,
    type: 'note',
    status: 'active',
    current_version: 1,
    updated_at: '2026-11-01T00:00:00Z',
  }));

const api = { current: null };

function Harness({ count = 1000, viewMode = 'table', positionOffset = 0, totalCount = count }) {
  const listScrollRef = useRef(null);
  const objects = useMemo(() => makeObjects(count), [count]);
  const cardColumns = 3;
  const rows = viewMode === 'card' ? Math.ceil(count / cardColumns) : count;
  const { virtualizer, scrollMargin } = useWindowListVirtualizer({
    listRef: listScrollRef,
    count: rows,
    estimateSize: () => (viewMode === 'card' ? 318 : 72),
    overscan: 5,
  });
  useEffect(() => { api.current = virtualizer; });
  return (
    <MemoryRouter>
      <DashboardObjectList
        listScrollRef={listScrollRef}
        listVirtualizer={virtualizer}
        scrollMargin={scrollMargin}
        objects={objects}
        viewMode={viewMode}
        listDensity="comfortable"
        cardColumns={cardColumns}
        streamItems={[]}
        selectedIds={new Set()}
        toggleSelect={() => {}}
        selectionMode={false}
        runPromptSuffix=""
        totalCount={totalCount}
        positionOffset={positionOffset}
      />
    </MemoryRouter>
  );
}

describe('DashboardObjectList', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('virtualizes against the window', () => {
    render(<Harness />);
    const list = screen.getByRole('list', { name: 'Knowledge objects' });
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(100);
    expect(list.style.maxHeight).toBe('');
    expect(list.style.overflow).toBe('');
  });

  it('scrolls the window to bring a far row into view', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    // jsdom lays nothing out: give the document the height 1,000 rows would have.
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 1000 * 72 });
    render(<Harness />);
    act(() => { api.current.scrollToIndex(499, { align: 'start' }); });
    expect(scrollTo).toHaveBeenCalled();
    const [arg] = scrollTo.mock.calls.at(-1);
    expect(arg.top).toBeGreaterThanOrEqual(499 * 72);
    delete document.documentElement.scrollHeight;
  });

  it('gives each row its position in the whole result', () => {
    render(<Harness />);
    const first = screen.getAllByRole('listitem')[0];
    expect(first).toHaveAttribute('aria-posinset', '1');
    expect(first).toHaveAttribute('aria-setsize', '1000');
  });

  it('counts positions across pages', () => {
    render(<Harness count={50} positionOffset={50} totalCount={120} />);
    const first = screen.getAllByRole('listitem')[0];
    expect(first).toHaveAttribute('aria-posinset', '51');
    expect(first).toHaveAttribute('aria-setsize', '120');
  });

  it('makes each card the list item in card view', () => {
    render(<Harness count={30} viewMode="card" />);
    const items = screen.getAllByRole('listitem');
    expect(items[0].tagName).toBe('ARTICLE');
    expect(items[1]).toHaveAttribute('aria-posinset', '2');
    expect(items[0]).toHaveAttribute('aria-setsize', '30');
  });
});
