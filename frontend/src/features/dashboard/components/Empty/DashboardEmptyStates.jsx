import { Link } from 'react-router-dom';
import TypeMark from '../../../../components/TypeMark';
import FilterChip from '../Toolbar/FilterChip';
import './DashboardEmptyStates.css';

/**
 * No results for current filters — shows removable filter chips.
 */
export function DashboardEmptyNoResults({ filterChips, onClearAll }) {
  return (
    <section className="dashboard-empty dashboard-empty--filtered" aria-label="No results">
      <div className="dashboard-empty-icon" aria-hidden="true">
        <TypeMark type="note" size="lg" />
      </div>
      <h3 className="dashboard-empty-title">No objects match</h3>
      <p className="dashboard-empty-desc">Try removing a filter or broadening your search.</p>
      {filterChips.length > 0 && (
        <div className="dashboard-empty-chips" role="list" aria-label="Active filters">
          {filterChips.map((chip) => (
            <FilterChip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
          ))}
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={onClearAll}>
        Clear all filters
      </button>
    </section>
  );
}

/**
 * First-run empty library (0 objects, no filters).
 */
export function DashboardEmptyFirstRun() {
  return (
    <section className="dashboard-empty dashboard-empty--first-run" aria-label="Get started">
      <div className="dashboard-empty-rings" aria-hidden="true">
        <span className="dashboard-empty-ring dashboard-empty-ring--capture" />
        <span className="dashboard-empty-ring dashboard-empty-ring--tend" />
        <span className="dashboard-empty-ring dashboard-empty-ring--close" />
      </div>
      <h3 className="dashboard-empty-title">Start your rhythm</h3>
      <p className="dashboard-empty-desc">
        Capture ideas, tend what matters, close what is done. Create your first object with <kbd>c</kbd> or the button below.
      </p>
      <Link to="/objects/new" className="btn btn-primary">
        Create your first object
      </Link>
    </section>
  );
}
