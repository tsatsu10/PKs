import FilterChip from './FilterChip';
import './ActiveFiltersStrip.css';
import Button from '../../../../components/ui/Button';

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
        <Button variant="ghost" size="sm" className="active-filters-add" onClick={onAddFilter}>
          + Filter
        </Button>
      )}
      <Button variant="ghost" size="sm" className="active-filters-clear" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
