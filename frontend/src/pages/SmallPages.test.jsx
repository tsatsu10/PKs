import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createTestQueryClient } from '../test/queryTestUtils';
import { ToastProvider } from '../components/ui/Toaster';

vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  return { supabase: mockSupabase().client };
});
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('../data/usePrefetchObject', () => ({ usePrefetchObject: () => () => ({}) }));
vi.mock('../data/taxonomy', () => ({ useTaxonomy: () => ({ domains: [], tags: [] }) }));

const search = vi.hoisted(() => ({ rows: [], hasNextPage: false }));
vi.mock('../data/objects', () => ({
  useSearchResults: (applied) => ({
    data: applied ? { pages: [search.rows] } : undefined,
    isPending: false,
    isFetchingNextPage: false,
    hasNextPage: search.hasNextPage,
    error: null,
    fetchNextPage: () => {},
    refetch: () => {},
  }),
}));

const pastes = vi.hoisted(() => ({ rows: [] }));
vi.mock('../data/pasteBin', () => ({
  usePasteList: () => ({ rows: pastes.rows, query: { isPending: false, error: null, refetch: () => {}, hasNextPage: false }, removeRow: () => {} }),
  usePasteItem: (id) => ({ data: pastes.rows.find((p) => p.id === id) ?? null }),
  invalidatePasteBin: () => {},
}));

const theme = vi.hoisted(() => ({ value: 'dark', setTheme: null }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: theme.value, setTheme: theme.setTheme }) }));

import Search from './Search';
import PasteBin from './PasteBin';
import ThemePicker from '../components/ThemePicker';

const wrap = (ui, entries = ['/']) =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider><MemoryRouter initialEntries={entries}>{ui}</MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  );

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: `o${i + 1}`, title: `Result ${i + 1}`, type: 'note' }));

describe('Search (A10, M5)', () => {
  beforeEach(() => { search.rows = makeRows(200); search.hasNextPage = false; });

  it('has one h1', () => {
    wrap(<Search />, ['/search?q=res']);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('gives each result its position', () => {
    wrap(<Search />, ['/search?q=res']);
    const items = within(screen.getByRole('list', { name: 'Search results' })).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(100);
    expect(items[0]).toHaveAttribute('aria-posinset', '1');
    expect(items[0]).toHaveAttribute('aria-setsize', '200');
  });

  it('says the total is unknown while more can load', () => {
    search.hasNextPage = true;
    wrap(<Search />, ['/search?q=res']);
    expect(within(screen.getByRole('list', { name: 'Search results' })).getAllByRole('listitem')[0]).toHaveAttribute('aria-setsize', '-1');
  });

  it('has no inner scroll box', () => {
    wrap(<Search />, ['/search?q=res']);
    const list = screen.getByRole('list', { name: 'Search results' });
    expect(list.style.maxHeight).toBe('');
    expect(list.style.overflow).toBe('');
  });
});

describe('PasteBin (A15)', () => {
  beforeEach(() => {
    pastes.rows = [
      { id: 'p1', title: 'Snippet one', content: 'a', updated_at: '2026-11-01T00:00:00Z' },
      { id: 'p2', title: 'Snippet two', content: 'b', updated_at: '2026-11-02T00:00:00Z' },
    ];
  });

  it('marks the selected paste as current', () => {
    wrap(<PasteBin />);
    const one = screen.getByRole('button', { name: /Snippet one/ });
    const two = screen.getByRole('button', { name: /Snippet two/ });
    expect(one).not.toHaveAttribute('aria-current');
    fireEvent.click(one);
    expect(one).toHaveAttribute('aria-current', 'true');
    expect(two).not.toHaveAttribute('aria-current');
  });

  it('has one h1 and labelled editor fields', () => {
    wrap(<PasteBin />);
    expect(screen.getByRole('heading', { level: 1, name: 'Paste bin' })).toBeInTheDocument();
    expect(screen.getByLabelText('Paste title')).toBeInTheDocument();
    expect(screen.getByLabelText('Paste content')).toBeInTheDocument();
  });
});

describe('ThemePicker (A15)', () => {
  it('marks the active theme as pressed', () => {
    theme.value = 'light';
    theme.setTheme = vi.fn();
    render(<ThemePicker />);
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(theme.setTheme).toHaveBeenCalledWith('system');
  });
});
