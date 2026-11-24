import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { stubMatchMedia } from '../../test/matchMedia';
import Header from './Header';
import LinkSearch from './LinkSearch';
import Links from './Links';
import Taxonomy from './Taxonomy';
import Attachments from './Attachments';
import SharePanel from './SharePanel';
import ExportPanel from './ExportPanel';
import { TEST_OBJECT } from './testUtils';

vi.mock('../../lib/reportError', () => ({ reportError: vi.fn() }));

afterEach(() => { vi.restoreAllMocks(); });

const actions = {
  togglePin: vi.fn(), pinning: false, duplicate: vi.fn(), duplicating: false, remove: vi.fn(), deleting: false,
  saveVersion: vi.fn(), savingVersion: false,
} as never;
const ACTION_NAMES = ['Pin', 'Export', 'Duplicate', 'Share', 'Save version', 'Delete'];

function renderHeader() {
  const onToggleExport = vi.fn();
  render(
    <MemoryRouter>
      <Header object={TEST_OBJECT} isOwner canEdit canLink={false} linkSearch={null} actions={actions} onToggleExport={onToggleExport} onToggleShare={vi.fn()} />
    </MemoryRouter>,
  );
  return { onToggleExport };
}

describe('Header (M6)', () => {
  it('shows every action as a button on wide screens', () => {
    stubMatchMedia(() => false);
    renderHeader();
    for (const name of ACTION_NAMES) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('collapses header actions into a menu on narrow screens', () => {
    stubMatchMedia((q) => q.includes('max-width: 767px'));
    const { onToggleExport } = renderHeader();
    const more = screen.getByRole('button', { name: 'More actions' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    for (const name of ACTION_NAMES) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    fireEvent.click(more);
    const panel = screen.getByRole('dialog', { name: 'More actions' });
    for (const name of ACTION_NAMES) expect(within(panel).getByRole('button', { name })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Export' }));
    expect(onToggleExport).toHaveBeenCalledTimes(1);
  });
});

describe('Taxonomy chips and pickers', () => {
  const base = {
    isOwner: true,
    objectDomains: [{ id: 'd1', name: 'Work' }],
    objectTags: [{ id: 't1', name: 'ai' }],
    availableDomains: [],
    availableTags: [],
    suggestedTags: [],
    panelErrors: {},
    retryPanel: vi.fn(),
  };

  it('names each chip remove after its item', () => {
    const removeDomain = vi.fn();
    const removeTag = vi.fn();
    render(<Taxonomy {...base} actions={{ addDomain: vi.fn(), addTag: vi.fn(), removeDomain, removeTag }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove domain Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag ai' }));
    expect(removeDomain).toHaveBeenCalledWith('d1');
    expect(removeTag).toHaveBeenCalledWith('t1');
  });

  it('keeps the picker mounted after the last option is added', () => {
    render(<Taxonomy {...base} actions={{ addDomain: vi.fn(), addTag: vi.fn(), removeDomain: vi.fn(), removeTag: vi.fn() }} />);
    const domains = screen.getByRole('combobox', { name: 'Add domain' });
    const tags = screen.getByRole('combobox', { name: 'Add tag' });
    expect(domains).toBeEnabled();
    expect(tags).toBeEnabled();
    fireEvent.keyDown(domains, { key: 'ArrowDown' });
    expect(screen.getByText('No more domains to add')).toBeInTheDocument();
  });

  it('titles each card as a region', () => {
    render(<Taxonomy {...base} actions={{ addDomain: vi.fn(), addTag: vi.fn(), removeDomain: vi.fn(), removeTag: vi.fn() }} />);
    expect(screen.getByRole('region', { name: 'Domains' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tags' })).toBeInTheDocument();
  });
});

describe('LinkSearch', () => {
  const results = [
    { id: 'o2', title: 'Budget', type: 'note' },
    { id: 'o3', title: 'Roadmap', type: 'note' },
  ];
  const makeLinks = (over = {}) => ({
    addLink: vi.fn(),
    search: { query: 'b', setQuery: vi.fn(), results, open: true, setOpen: vi.fn(), containerRef: { current: null }, ...over },
  }) as never;

  it('lists link search results without a listbox', () => {
    const links = makeLinks();
    render(
      <MemoryRouter>
        <LinkSearch links={links} outgoingLinks={[{ id: 'l1', to_object_id: 'o3' } as never]} prefetch={() => ({})} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('listbox')).toBeNull();
    const list = screen.getByRole('list', { name: 'Search results' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const input = screen.getByRole('searchbox', { name: 'Search objects to link' });
    expect(input).toHaveAttribute('aria-controls', list.id);
    fireEvent.click(within(list).getByRole('button', { name: 'Link Budget' }));
    expect((links as { addLink: ReturnType<typeof vi.fn> }).addLink).toHaveBeenCalledWith('o2');
    expect(within(list).getByText('Linked')).toBeInTheDocument();
  });

  it('says when nothing matches', () => {
    render(<MemoryRouter><LinkSearch links={makeLinks({ results: [] })} outgoingLinks={[]} prefetch={() => ({})} /></MemoryRouter>);
    expect(screen.getByText('No objects found')).toBeInTheDocument();
  });
});

describe('side panels on primitives', () => {
  it('links, attachments, share and export are titled regions with labelled controls', () => {
    const shares = { shares: [], email: '', setEmail: vi.fn(), role: 'viewer', setRole: vi.fn(), sharing: false, add: vi.fn(), revoke: vi.fn() } as never;
    const exportState = {
      format: 'md', setFormat: vi.fn(), template: 'raw', setTemplate: vi.fn(), applyTemplate: vi.fn(), run: vi.fn(), setShow: vi.fn(), setInclude: vi.fn(),
      include: { content: true, summary: false, key_points: false, tags: false, domains: false, links: false },
    } as never;
    render(
      <MemoryRouter>
        <Links isOwner canLink outgoing={[]} incoming={[]} availableToLink={[]} suggested={[]} error={null} onRetry={vi.fn()} links={{ addLink: vi.fn(), removeLink: vi.fn() }} prefetch={() => ({})} />
        <Attachments isOwner files={[]} error={null} onRetry={vi.fn()} attachments={{ uploading: false, attach: vi.fn(), download: vi.fn(), detach: vi.fn() } as never} />
        <SharePanel shares={shares} onClose={vi.fn()} />
        <ExportPanel exportState={exportState} />
      </MemoryRouter>,
    );
    for (const name of ['Links', 'Attachments', 'Share object', 'Export object']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    const share = screen.getByRole('region', { name: 'Share object' });
    expect(within(share).getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(within(share).getByLabelText('Role')).toBeInTheDocument();
    const exp = screen.getByRole('region', { name: 'Export object' });
    expect(within(exp).getByLabelText('Format')).toBeInTheDocument();
    expect(within(exp).getByLabelText('Template')).toBeInTheDocument();
    expect(within(exp).getByRole('group', { name: 'Include' })).toBeInTheDocument();
  });
});
