import { FileText, SearchX } from 'lucide-react';
import Button, { ButtonLink } from '../../../../components/ui/Button';
import EmptyState from '../../../../components/ui/EmptyState';
import FilterChip from '../Toolbar/FilterChip';
import './DashboardEmptyStates.css';

/**
 * No results for current filters — shows removable filter chips.
 */
export function DashboardEmptyNoResults({ filterChips, onClearAll }) {
  return (
    <section aria-label="No results">
      <EmptyState
        icon={SearchX}
        title="No objects match"
        description={
          <>
            <p>Try removing a filter or broadening your search.</p>
            {filterChips.length > 0 && (
              <div className="dashboard-empty-chips" role="list" aria-label="Active filters">
                {filterChips.map((chip) => (
                  <FilterChip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
                ))}
              </div>
            )}
          </>
        }
        action={<Button variant="primary" onClick={onClearAll}>Clear all filters</Button>}
      />
    </section>
  );
}

/**
 * First-run empty library (0 objects, no filters).
 */
export function DashboardEmptyFirstRun() {
  return (
    <section aria-label="Get started">
      <EmptyState
        icon={FileText}
        title="Start your rhythm"
        description={
          <p>
            Capture ideas, tend what matters, close what is done. Create your first object with <kbd>c</kbd> or the button below.
          </p>
        }
        action={<ButtonLink to="/objects/new" variant="primary">Create your first object</ButtonLink>}
      />
    </section>
  );
}
