import FilterChip from './FilterChip';
import './ActiveFiltersStrip.css';

/**
 * Active filter pills with clear-all.
 */
export default function ActiveFiltersStrip({
  chips,
  onClearAll,
  onAddFilter,
}) {
  if (!chips?.length) return null;

  return (
    <div className="active-filters-strip" role="region" aria-label="Active filters">
      {chips.map((chip) => (
        <FilterChip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
      ))}
      {onAddFilter && (
        <button type="button" className="btn btn-ghost btn-small active-filters-add" onClick={onAddFilter}>
          + Filter
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-small active-filters-clear" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
