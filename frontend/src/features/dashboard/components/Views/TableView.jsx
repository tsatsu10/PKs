import { memo } from 'react';
import { Link } from 'react-router-dom';
import TypeMark from '../../../../components/TypeMark';
import { formatObjectTypeLabel } from '../../../../constants';
import TitleCluster from '../../primitives/TitleCluster';
import MetaCluster from '../../primitives/MetaCluster';
import { usePrefetchObject } from '../../../../data/usePrefetchObject';
import './TableView.css';

/**
 * Dense table-style row (replaces legacy list view).
 */
function TableViewRow({
  obj,
  to,
  selected,
  onToggleSelect,
  selectionMode,
  objectIndex,
  compact,
}) {
  const summary = obj.snippet || obj.summary;
  const prefetch = usePrefetchObject();

  return (
    <div
      className={`table-view-row-wrap${selected ? ' table-view-row-wrap--selected' : ''}${compact ? ' table-view-row-wrap--compact' : ''}`}
      data-object-index={objectIndex}
    >
      <label className={`table-view-checkbox${selectionMode ? ' is-visible' : ''}`}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(obj.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${obj.title}`}
        />
      </label>
      <Link to={to} className="table-view-row" {...prefetch(obj.id)}>
        <span className="table-view-type" title={formatObjectTypeLabel(obj.type)}>
          <TypeMark type={obj.type} size="sm" />
          <span className="table-view-type-label">{formatObjectTypeLabel(obj.type)}</span>
        </span>
        <TitleCluster object={obj} className="table-view-title" />
        {summary && <span className="table-view-summary">{summary}</span>}
        <MetaCluster object={obj} compact />
      </Link>
    </div>
  );
}

export default memo(TableViewRow);
