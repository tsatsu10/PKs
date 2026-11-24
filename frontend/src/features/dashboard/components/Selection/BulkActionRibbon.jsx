import { X } from 'lucide-react';
import Button from '../../../../components/ui/Button';
import IconButton from '../../../../components/ui/IconButton';
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
        {onSelectAllPage && <Button size="sm" onClick={onSelectAllPage}>All on page</Button>}
        <Button size="sm" onClick={onAddTag}>Tag…</Button>
        <Button size="sm" onClick={onAddDomain}>Domain…</Button>
        <Button size="sm" onClick={onSetStatus}>Status…</Button>
        <Button size="sm" onClick={onChangeType}>Type…</Button>
        <Button size="sm" onClick={onExport}>Export…</Button>
        <Button size="sm" variant="danger" onClick={onDelete}>Trash</Button>
      </div>
      <IconButton label="Clear selection" icon={X} onClick={onClear} />
    </div>
  );
}
