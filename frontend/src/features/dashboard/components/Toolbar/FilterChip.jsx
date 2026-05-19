/**
 * Removable filter chip for the active filters strip.
 */
export default function FilterChip({ label, onRemove }) {
  return (
    <span className="filter-chip">
      <span className="filter-chip-label">{label}</span>
      <button
        type="button"
        className="filter-chip-remove"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
      >
        ×
      </button>
    </span>
  );
}
