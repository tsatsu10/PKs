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
vi.mock('../data/prompts', () => ({
  usePromptsList: () => ({ data: list.data, isPending: false, error: null, refetch: () => {} }),
  invalidatePrompts: () => {},
}));

import PromptBank from './PromptBank';

const PROMPTS = [
  { id: 'p1', name: 'Executive summary', description: 'For leadership', applies_to_types: [], tags: ['writing'], prompt_text: 'Summarise this.' },
  { id: 'p2', name: 'Action items', description: '', applies_to_types: ['note'], tags: [], prompt_text: 'List actions.' },
];

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider><MemoryRouter><PromptBank /></MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  list.data = PROMPTS;
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

const openFirst = () => fireEvent.click(screen.getByRole('button', { name: /^Executive summary/ }));

describe('PromptBank', () => {
  it('has one h1 and no nested interactive rows', () => {
    const { container } = renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelector('[role="button"]')).toBeNull();
    for (const button of container.querySelectorAll('button')) {
      expect(button.querySelector('button, a, input')).toBeNull();
    }
  });

  it('selects a row from its main button and runs actions from their own', () => {
    renderPage();
    const row = screen.getByRole('button', { name: /^Executive summary/ }).closest('li');
    fireEvent.click(within(row).getByRole('button', { name: 'Copy prompt' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Summarise this.');
    expect(screen.queryByRole('heading', { name: 'Edit prompt' })).not.toBeInTheDocument();
    openFirst();
    expect(screen.getByRole('heading', { name: 'Edit prompt' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Executive summary');
    expect(screen.getByRole('button', { name: /^Executive summary/ })).toHaveAttribute('aria-current', 'true');
  });

  it('asks before discarding edits', () => {
    renderPage();
    openFirst();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Exec summary v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const confirm = screen.getByRole('dialog', { name: 'Discard your changes?' });
    expect(screen.getByRole('heading', { name: 'Edit prompt' })).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Exec summary v2');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('heading', { name: 'Edit prompt' })).not.toBeInTheDocument();
  });

  it('asks before switching to another prompt with unsaved edits', () => {
    renderPage();
    openFirst();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: /^Action items/ }));
    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Action items');
  });

  it('closes at once when nothing changed', () => {
    renderPage();
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit prompt' })).not.toBeInTheDocument();
  });

  it('confirms a delete in a dialog', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Executive summary' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete this prompt?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows tags as chips with named remove buttons', () => {
    renderPage();
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag writing' }));
    expect(screen.queryByRole('button', { name: 'Remove tag writing' })).not.toBeInTheDocument();
  });

  it('offers a first prompt when there are none', () => {
    list.data = [];
    renderPage();
    expect(screen.getByText('No prompts yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save your first prompt' }));
    expect(screen.getByRole('heading', { name: 'Save new prompt' })).toBeInTheDocument();
  });
});
