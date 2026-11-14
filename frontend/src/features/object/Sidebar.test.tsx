import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Taxonomy from './Taxonomy';
import Links from './Links';
import History from './History';
import type { OutgoingLink, IncomingLink, VersionRow } from './types';

const noopActions = { addDomain: vi.fn(), removeDomain: vi.fn(), addTag: vi.fn(), removeTag: vi.fn() };
const prefetch = (id: string) => ({ 'data-prefetch': id });

describe('Taxonomy', () => {
  const base = {
    objectDomains: [{ id: 'd1', name: 'Work' }],
    objectTags: [{ id: 't1', name: 'ai' }],
    availableDomains: [{ id: 'd2', name: 'Home' }],
    availableTags: [{ id: 't2', name: 'ml' }],
    suggestedTags: [],
    panelErrors: {},
    retryPanel: vi.fn(),
    actions: noopActions,
  };

  it('non-owner sees chips without remove buttons or add selects', () => {
    const { container } = render(<Taxonomy {...base} isOwner={false} />);
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('ai')).toBeInTheDocument();
    expect(container.querySelector('button[aria-label^="Remove"]')).toBeNull();
    expect(screen.queryByRole('option', { name: '+ Add tag' })).not.toBeInTheDocument();
  });

  it('a panel error shows QueryError with Retry calling retryPanel("tags")', () => {
    const retryPanel = vi.fn();
    render(<Taxonomy {...base} isOwner panelErrors={{ tags: new Error('x') }} retryPanel={retryPanel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryPanel).toHaveBeenCalledWith('tags');
  });
});

describe('Links', () => {
  const outgoing: OutgoingLink[] = [{ id: 'e1', to_object_id: 'o2', relationship_type: 'references', target: { id: 'o2', title: 'Two', type: 'note' } }];
  const incoming: IncomingLink[] = [{ id: 'e2', from_object_id: 'o3', relationship_type: 'supports', source: { id: 'o3', title: 'Three', type: 'note' } }];

  it('outgoing and incoming links render with prefetch props and owner remove buttons', () => {
    const removeLink = vi.fn();
    render(
      <MemoryRouter>
        <Links isOwner canLink outgoing={outgoing} incoming={incoming} availableToLink={[]} suggested={[]} error={null}
          onRetry={vi.fn()} links={{ addLink: vi.fn(), removeLink }} prefetch={prefetch} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Two' })).toHaveAttribute('data-prefetch', 'o2');
    expect(screen.getByRole('link', { name: 'Three' })).toHaveAttribute('href', '/objects/o3');
    const removes = screen.getAllByRole('button', { name: 'Remove link' });
    expect(removes).toHaveLength(2);
    fireEvent.click(removes[1]);
    expect(removeLink).toHaveBeenCalledWith('e2', false);
  });
});

describe('History', () => {
  const versions: VersionRow[] = Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, version: i + 1, title: `T${i}`, created_at: '2026-10-01T00:00:00Z' }));

  it('readonly variant lists at most 10 versions', () => {
    const { container } = render(
      <History variant="readonly" isOwner={false} versions={versions} versionsError={null} onRetryVersions={vi.fn()}
        promptRuns={[]} promptTemplates={[]} runsError={null} onRetryRuns={vi.fn()} restoreVersion={vi.fn()} restoringVersion={null} />,
    );
    const list = container.querySelector('.version-list') as HTMLElement;
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
  });

  it('owner variant lists every version with Restore', () => {
    const restoreVersion = vi.fn();
    render(
      <History variant="owner" isOwner versions={versions.slice(0, 2)} versionsError={null} onRetryVersions={vi.fn()}
        promptRuns={[]} promptTemplates={[]} runsError={null} onRetryRuns={vi.fn()} restoreVersion={restoreVersion} restoringVersion={null} />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]);
    expect(restoreVersion).toHaveBeenCalledWith(versions[0]);
    expect(screen.getByText('No runs yet.')).toBeInTheDocument();
  });
});
