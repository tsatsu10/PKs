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
const list = vi.hoisted(() => ({ data: [] }));
vi.mock('../data/templates', () => ({
  useTemplatesList: () => ({ data: list.data, isPending: false, error: null, refetch: () => {} }),
  invalidateTemplates: () => {},
}));

import Templates from './Templates';

const schema = {
  titleField: 'title',
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'state', label: 'State', type: 'select', required: false, options: ['Draft', 'Done'] },
  ],
};
const TEMPLATES = [
  { id: 't1', name: 'Meeting note', description: 'For meetings', schema },
  { id: 't2', name: 'Report', description: '', schema },
];

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider><MemoryRouter><Templates /></MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => { list.data = TEMPLATES; });

const openFirst = () => fireEvent.click(screen.getByRole('button', { name: /^Meeting note/ }));

describe('Templates', () => {
  it('has one h1 and no nested interactive rows', () => {
    const { container } = renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelector('[role="button"]')).toBeNull();
    for (const el of container.querySelectorAll('button, a')) {
      expect(el.querySelector('button, a, input')).toBeNull();
    }
  });

  it('selects a row from its main button and runs actions from their own', () => {
    renderPage();
    const row = screen.getByRole('button', { name: /^Meeting note/ }).closest('li');
    expect(within(row).getByRole('link', { name: 'Use template' })).toHaveAttribute('href', '/objects/new?template=t1');
    expect(within(row).getByRole('button', { name: 'Duplicate Meeting note' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit template' })).not.toBeInTheDocument();
    openFirst();
    expect(screen.getByRole('heading', { name: 'Edit template' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Meeting note');
    expect(screen.getByRole('button', { name: /^Meeting note/ })).toHaveAttribute('aria-current', 'true');
  });

  it('asks before discarding edits', () => {
    renderPage();
    openFirst();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standup note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const confirm = screen.getByRole('dialog', { name: 'Discard your changes?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Standup note');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('heading', { name: 'Edit template' })).not.toBeInTheDocument();
  });

  it('asks before switching templates with unsaved edits', () => {
    renderPage();
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    fireEvent.click(screen.getByRole('button', { name: /^Report/ }));
    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument();
  });

  it('closes at once when nothing changed', () => {
    renderPage();
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit template' })).not.toBeInTheDocument();
  });

  it('names each field row control after its field', () => {
    renderPage();
    openFirst();
    const rows = screen.getByRole('list', { name: 'Fields' });
    const second = within(rows).getAllByRole('listitem')[1];
    expect(within(second).getByLabelText('Key for field 2')).toHaveValue('state');
    expect(within(second).getByLabelText('Label for field 2')).toHaveValue('State');
    expect(within(second).getByLabelText('Type for field 2')).toHaveValue('select');
    expect(within(second).getByLabelText('Options for field 2')).toHaveValue('Draft, Done');
    fireEvent.click(within(second).getByRole('button', { name: 'Remove field 2' }));
    expect(within(rows).getAllByRole('listitem')).toHaveLength(1);
  });

  it('confirms a delete in a dialog', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Meeting note' }));
    expect(screen.getByRole('dialog', { name: 'Delete this template?' })).toBeInTheDocument();
  });
});
