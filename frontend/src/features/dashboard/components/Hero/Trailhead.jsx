import { Link } from 'react-router-dom';
import TypeMark from '../../../../components/TypeMark';
import { formatObjectTypeLabel } from '../../../../constants';
import { formatRelativeTime } from '../../lib/relativeTime';
import HotkeyHint from '../../primitives/HotkeyHint';
import './Trailhead.css';

const KIND_LABEL = {
  resume: 'Resume',
  pending: 'Pending',
  spark: 'Spark',
};

/**
 * @param {{ kind: 'resume' | 'pending' | 'spark', object: object, shortcutKey?: string, to: string }} props
 */
export default function Trailhead({ kind, object, shortcutKey, to }) {
  if (!object) return null;

  const metaParts = [
    formatRelativeTime(object.updated_at || object.last_viewed_at),
    object.current_version != null ? `v${object.current_version}` : null,
  ].filter(Boolean);

  if (kind === 'pending' && object.due_at) {
    metaParts.unshift(`Due ${new Date(object.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  }

  return (
    <Link
      to={to}
      className={`trailhead trailhead--${kind}`}
      aria-label={`${KIND_LABEL[kind]}: ${object.title}`}
    >
      <span className="trailhead-accent" aria-hidden="true" />
      <span className="trailhead-eyebrow">{KIND_LABEL[kind]}</span>
      <span className="trailhead-title-row">
        <TypeMark type={object.type} size="sm" />
        <span className="trailhead-title">{object.title}</span>
      </span>
      <span className="trailhead-meta">
        {formatObjectTypeLabel(object.type)}
        {metaParts.length > 0 && ` · ${metaParts.join(' · ')}`}
      </span>
      <span className="trailhead-cta">
        Open
        {shortcutKey && <HotkeyHint keys={[shortcutKey]} />}
      </span>
    </Link>
  );
}
