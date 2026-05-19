import './BulkActionRibbon.css';

/**
 * Sticky bottom bulk actions (replaces top dropdown).
 */
export default function BulkActionRibbon({
  count,
  onClear,
  onSelectAllPage,
  onAddTag,
  onAddDomain,
  onSetStatus,
  onChangeType,
  onExport,
  onDelete,
}) {
  if (count <= 0) return null;

  return (
    <div className="bulk-action-ribbon" role="toolbar" aria-label={`Bulk actions for ${count} selected`}>
      <span className="bulk-action-ribbon-count">{count} selected</span>
      <div className="bulk-action-ribbon-actions">
        {onSelectAllPage && (
          <button type="button" className="btn btn-secondary btn-small" onClick={onSelectAllPage}>
            All on page
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-small" onClick={onAddTag}>Tag…</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onAddDomain}>Domain…</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onSetStatus}>Status…</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onChangeType}>Type…</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onExport}>Export…</button>
        <button type="button" className="btn btn-secondary btn-small bulk-action-ribbon-danger" onClick={onDelete}>
          Trash
        </button>
      </div>
      <button type="button" className="btn btn-ghost btn-small bulk-action-ribbon-dismiss" onClick={onClear} aria-label="Clear selection">
        ✕
      </button>
    </div>
  );
}
