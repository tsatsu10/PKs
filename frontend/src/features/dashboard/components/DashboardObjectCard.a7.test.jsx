import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import DashboardObjectCard from './DashboardObjectCard';
import { LinkedObjectsContext } from '../context/linkedObjectsHooks';

vi.mock('../../../data/usePrefetchObject', () => ({ usePrefetchObject: () => () => ({}) }));

// useRowVisibility observes rows once a LinkedObjects provider is present; jsdom has no IntersectionObserver.
vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });

const day = 24 * 60 * 60 * 1000;
const OBJ = {
  id: 'obj-1',
  title: 'Quarterly review',
  type: 'note',
  status: 'active',
  current_version: 3,
  updated_at: '2026-11-01T00:00:00Z',
};
const linked = {
  registerVisible: () => () => {},
  getLinksFor: () => ({
    links: [{ id: 'obj-2', title: 'Budget', type: 'note' }],
    total: 4,
  }),
};

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderCard(obj = OBJ, props = {}) {
  const onToggleSelect = vi.fn();
  render(
    <MemoryRouter initialEntries={['/']}>
      <LinkedObjectsContext.Provider value={linked}>
        <DashboardObjectCard obj={obj} to={`/objects/${obj.id}`} selected={false} onToggleSelect={onToggleSelect} {...props} />
      </LinkedObjectsContext.Provider>
      <Where />
    </MemoryRouter>,
  );
  return { onToggleSelect };
}

describe('DashboardObjectCard (A7)', () => {
  it('opens from the card body but not from its controls', () => {
    renderCard();
    const titleLinks = screen.getAllByRole('link', { name: 'Quarterly review' });
    expect(titleLinks).toHaveLength(1);
    expect(titleLinks[0]).toHaveAttribute('href', '/objects/obj-1');
    // The title link is what stretches over the card; nothing interactive may sit inside it.
    expect(titleLinks[0].querySelector('a, button, input')).toBeNull();

    const checkbox = screen.getByRole('checkbox', { name: 'Select Quarterly review' });
    expect(checkbox.closest('a')).toBeNull();
    const chip = screen.getByRole('link', { name: /Budget/ });
    expect(chip.parentElement.closest('a')).toBeNull();
    expect(screen.getByRole('button', { name: '+3' }).closest('a')).toBeNull();
  });

  it('toggles selection without navigating', () => {
    const { onToggleSelect } = renderCard();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Quarterly review' }));
    expect(onToggleSelect).toHaveBeenCalledWith('obj-1');
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('says overdue in words', () => {
    renderCard({ ...OBJ, due_at: new Date(Date.now() - day).toISOString() });
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('says due soon in words', () => {
    renderCard({ ...OBJ, due_at: new Date(Date.now() + 3 * day).toISOString() });
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('uses no badge for a due date further out', () => {
    renderCard({ ...OBJ, due_at: new Date(Date.now() + 30 * day).toISOString() });
    expect(screen.queryByText('Due soon')).not.toBeInTheDocument();
    expect(screen.getByText(/^Due /)).toBeInTheDocument();
  });

  it('keeps the checkbox shown while a selection is in progress', () => {
    renderCard(OBJ, { selectionMode: true });
    expect(screen.getByRole('checkbox').closest('label')).toHaveClass('is-visible');
  });
});
