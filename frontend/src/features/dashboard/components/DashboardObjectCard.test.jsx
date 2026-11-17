import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardObjectCard from './DashboardObjectCard';
import TimelineRow from './Views/TimelineRow';
import TableViewRow from './Views/TableView';

// Every row (and its LinkedBar) calls usePrefetchObject on each render, so it doubles as a render counter.
const renderProbe = vi.fn();
vi.mock('../../../data/usePrefetchObject', () => ({
  usePrefetchObject: () => {
    renderProbe();
    return () => ({});
  },
}));

const OBJECTS = [1, 2, 3].map((n) => ({
  id: `obj-${n}`,
  title: `Object ${n}`,
  type: 'note',
  status: 'active',
  current_version: 1,
  updated_at: '2026-11-01T00:00:00Z',
}));
const toggle = () => {};

function Harness({ Row }) {
  const [query, setQuery] = useState('');
  return (
    <MemoryRouter>
      <input aria-label="query" value={query} onChange={(e) => setQuery(e.target.value)} />
      {OBJECTS.map((obj, i) => (
        createElement(Row, {
          key: obj.id,
          obj,
          to: `/objects/${obj.id}`,
          selected: false,
          onToggleSelect: toggle,
          objectIndex: i,
        })
      ))}
    </MemoryRouter>
  );
}

describe.each([
  ['DashboardObjectCard', DashboardObjectCard],
  ['TimelineRow', TimelineRow],
  ['TableViewRow', TableViewRow],
])('%s (P2)', (_name, Row) => {
  beforeEach(() => renderProbe.mockClear());

  it('does not re-render when the parent only changes the search query', () => {
    render(<Harness Row={Row} />);
    const mounted = renderProbe.mock.calls.length;
    expect(mounted).toBeGreaterThanOrEqual(3);

    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'ab' } });

    expect(screen.getByLabelText('query')).toHaveValue('ab');
    expect(renderProbe).toHaveBeenCalledTimes(mounted);
  });
});
