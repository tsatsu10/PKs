import { Link } from 'react-router-dom';
import TypeMark from '../../../../components/TypeMark';
import { formatObjectTypeLabel } from '../../../../constants';
import TitleCluster from '../../primitives/TitleCluster';
import MetaCluster from '../../primitives/MetaCluster';
import LinkedBar from './LinkedBar';
import { useRowVisibility } from '../../hooks/useRowVisibility';
import './StreamView.css';
import './LinkedBar.css';

/**
 * Single Stream view row (timeline style).
 */
export default function TimelineRow({
  obj,
  to,
  selected,
  onToggleSelect,
  selectionMode,
  objectIndex,
  /** Index in the current page object list (for J/K keyboard nav) */
  navIndex,
  snippet,
  runPromptSuffix = '',
  listDensity = 'comfortable',
}) {
  const summary = snippet || obj.snippet || obj.summary;
  const rowRef = useRowVisibility(obj.id);

  return (
    <div
      ref={rowRef}
      className={`timeline-row-wrap${selected ? ' timeline-row-wrap--selected' : ''}`}
      data-object-index={navIndex ?? objectIndex}
      role="listitem"
    >
      <label className={`timeline-row-checkbox${selectionMode ? ' is-visible' : ''}`}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(obj.id)}
          aria-label={`Select ${obj.title}`}
        />
      </label>
      <div className="timeline-row-stack">
        <Link to={to} className="timeline-row" aria-label={`${obj.title}, ${formatObjectTypeLabel(obj.type)}`}>
          <TypeMark type={obj.type} size="sm" className="timeline-row-mark" />
          <span className="timeline-row-main">
            <TitleCluster object={obj} className="timeline-row-title" />
            {summary && <span className="timeline-row-snippet">{summary}</span>}
          </span>
          <MetaCluster object={obj} compact />
        </Link>
        <LinkedBar
          objectId={obj.id}
          runPromptSuffix={runPromptSuffix}
          compact={listDensity === 'compact'}
        />
      </div>
    </div>
  );
}
