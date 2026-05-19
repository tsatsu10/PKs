import { formatObjectTypeLabel } from '../constants';
import { getTypeMarkAbbrev, getTypeMarkHue } from '../constants/typeMarks';
import './TypeMark.css';

/**
 * Designed type indicator (replaces emoji in dashboard surfaces).
 */
export default function TypeMark({ type, size = 'md', className = '' }) {
  const hue = getTypeMarkHue(type);
  const abbrev = getTypeMarkAbbrev(type);
  const label = formatObjectTypeLabel(type) || 'Object';

  return (
    <span
      className={`type-mark type-mark--${size}${className ? ` ${className}` : ''}`}
      style={{ '--type-mark-hue': hue }}
      title={label}
      aria-label={label}
      role="img"
    >
      <span className="type-mark-glyph" aria-hidden="true">{abbrev}</span>
    </span>
  );
}
