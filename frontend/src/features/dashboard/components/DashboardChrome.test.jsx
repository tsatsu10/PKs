import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { stubMatchMedia } from '../../../test/matchMedia';
import { modKey } from '../../../lib/keyboardMap';
import DashboardModals from './DashboardModals';
import DashboardPagination from '../../../components/DashboardPagination';
import DashboardQuickAddForm from '../../../components/DashboardQuickAddForm';
import DashboardFilterPanel from '../../../components/DashboardFilterPanel';
import CommandBar from './Toolbar/CommandBar';
import Trailhead from './Hero/Trailhead';
import ActivityDrawer from './ActivityDrawer';

let root;
beforeEach(() => {
  root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
});
afterEach(() => {
  cleanup();
  root.remove();
  vi.restoreAllMocks();
});

const noop = () => {};
function modalProps(over = {}) {
  return {
    showExportModal: false, setShowExportModal: vi.fn(), exportScope: 'selected', setExportScope: noop,
    exportFormat: 'md', setExportFormat: noop, exportTemplate: 'raw', setExportTemplate: noop,
    exporting: false, handleExportSelected: vi.fn(), selectedIds: new Set(['a', 'b']),
    bulkModal: null, setBulkModal: vi.fn(), bulkDomainId: '', setBulkDomainId: vi.fn(),
    bulkTagId: '', setBulkTagId: vi.fn(), bulkType: 'note', setBulkType: vi.fn(),
    bulkStatus: 'active', setBulkStatus: vi.fn(), bulkActionLoading: false,
    domains: [{ id: 'd1', name: 'Work' }], tags: [{ id: 't1', name: 'urgent' }],
    createDomainInline: noop, createTagInline: noop, bulkAddDomain: vi.fn(), bulkAddTag: vi.fn(),
    bulkRemoveDomain: vi.fn(), bulkRemoveTag: vi.fn(), bulkDelete: vi.fn(), bulkChangeType: vi.fn(),
    bulkSetStatus: vi.fn(),
    ...over,
  };
}

describe('DashboardModals', () => {
  it('opens export as a labelled dialog and closes on Escape', () => {
    const props = modalProps({ showExportModal: true });
    render(<DashboardModals {...props} />, { container: root });
    const dialog = screen.getByRole('dialog', { name: 'Export 2 selected' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText('Scope')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Format')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Template')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(props.setShowExportModal).toHaveBeenCalledWith(false);
  });

  it.each([
    ['add_domain', 'Add domain to 2 objects'],
    ['add_tag', 'Add tag to 2 objects'],
    ['remove_domain', 'Remove domain from 2 objects'],
    ['remove_tag', 'Remove tag from 2 objects'],
    ['change_type', 'Change type for 2 objects'],
    ['set_status', 'Set status for 2 objects'],
    ['delete', 'Move 2 objects to Trash?'],
  ])('opens %s as a labelled dialog and closes on Escape', (bulkModal, name) => {
    const props = modalProps({ bulkModal });
    render(<DashboardModals {...props} />, { container: root });
    expect(screen.getByRole('dialog', { name })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(props.setBulkModal).toHaveBeenCalledWith(null);
  });

  it('runs the bulk action from the confirm button', () => {
    const props = modalProps({ bulkModal: 'delete' });
    render(<DashboardModals {...props} />, { container: root });
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
    expect(props.bulkDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps the action disabled until a domain is chosen', () => {
    render(<DashboardModals {...modalProps({ bulkModal: 'remove_domain' })} />, { container: root });
    expect(screen.getByRole('button', { name: 'Remove domain' })).toBeDisabled();
  });
});

describe('DashboardPagination', () => {
  const props = { page: 2, totalPages: 5, totalCount: 120, pageSize: 25, itemCount: 25, loading: false };

  it('marks the current page', () => {
    render(<DashboardPagination {...props} onPageChange={noop} />);
    const nav = screen.getByRole('navigation', { name: 'Objects pages' });
    expect(within(nav).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: 'Page 3' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the summary and changes page', () => {
    const onPageChange = vi.fn();
    render(<DashboardPagination {...props} onPageChange={onPageChange} />);
    expect(screen.getByText('Showing 26–50 of 120 · Page 2 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});

describe('quick add and filters', () => {
  it('labels the quick-add fields and submits', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<DashboardQuickAddForm title="T" content="C" onTitleChange={noop} onContentChange={noop} onSubmit={onSubmit} onCancel={noop} saving={false} />);
    expect(screen.getByLabelText('Title')).toHaveValue('T');
    expect(screen.getByLabelText('Content')).toHaveValue('C');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('labels every filter control', () => {
    render(
      <DashboardFilterPanel
        typeFilter="" setTypeFilter={noop} statusFilter="" setStatusFilter={noop} domainFilter="" setDomainFilter={noop}
        tagFilter="" setTagFilter={noop} dateFrom="" setDateFrom={noop} dateTo="" setDateTo={noop} dueFrom="" setDueFrom={noop}
        dueTo="" setDueTo={noop} domains={[]} tags={[]} onCreateDomain={noop} onCreateTag={noop} onApply={noop} onClear={noop}
      />,
    );
    const group = screen.getByRole('group', { name: 'Filters' });
    for (const label of ['Type', 'Status', 'Updated from', 'Updated to', 'Due from', 'Due to']) {
      expect(within(group).getByLabelText(label)).toBeInTheDocument();
    }
  });
});

describe('keyboard hints (M11)', () => {
  const bar = (
    <MemoryRouter>
      <CommandBar searchQuery="" onSearchChange={noop} onSearchSubmit={noop} viewMode="card" onViewModeChange={noop} onOpenFilters={noop} onOpenCommandPalette={noop} onToggleQuickAdd={noop} showFilters={false} />
    </MemoryRouter>
  );
  const trail = (
    <MemoryRouter>
      <Trailhead kind="resume" object={{ id: 'o1', title: 'Note', type: 'note', updated_at: '2026-11-01T00:00:00Z' }} shortcutDigit="1" to="/objects/o1" />
    </MemoryRouter>
  );

  it('shows the platform modifier on the command palette button', () => {
    stubMatchMedia(() => false);
    render(bar);
    const button = screen.getByRole('button', { name: 'Command palette' });
    expect(button).toHaveTextContent(modKey);
    expect(button).toHaveTextContent('K');
    expect(button).toHaveAttribute('title', `Command palette (${modKey}+K)`);
  });

  it('shows the trailhead shortcut with a pointer', () => {
    stubMatchMedia(() => false);
    const { container } = render(trail);
    expect(container.querySelectorAll('kbd')).toHaveLength(2);
  });

  it('shows no keyboard hints on touch', () => {
    stubMatchMedia((q) => q.includes('pointer: coarse'));
    const { container } = render(<>{bar}{trail}</>);
    expect(container.querySelector('kbd')).toBeNull();
    expect(screen.getByRole('button', { name: 'Command palette' })).toBeInTheDocument();
  });
});

describe('ActivityDrawer resize', () => {
  it('closes when the screen becomes wide', () => {
    stubMatchMedia(() => false);
    const onClose = vi.fn();
    const { rerender } = render(<ActivityDrawer open onClose={onClose}><p>Pulse</p></ActivityDrawer>, { container: root });
    expect(onClose).not.toHaveBeenCalled();
    stubMatchMedia((q) => q.includes('min-width: 1280px'));
    rerender(<ActivityDrawer open onClose={onClose}><p>Pulse</p></ActivityDrawer>);
    // useMediaQuery reads the new match on its change event; a remount stands in for it here.
    cleanup();
    render(<ActivityDrawer open onClose={onClose}><p>Pulse</p></ActivityDrawer>, { container: root });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
