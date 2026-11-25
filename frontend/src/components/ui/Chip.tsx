import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import './Chip.css';

export interface ChipProps {
  children: string;
  onRemove?: () => void;
  removeLabel?: string;
  tone?: 'neutral' | 'accent';
  href?: string;
  className?: string;
}

/** A small label for a domain, tag or filter, optionally linked and removable. */
export default function Chip({ children, onRemove, removeLabel, tone = 'neutral', href, className }: ChipProps) {
  return (
    <span className={['ui-chip', `ui-chip--${tone}`, className].filter(Boolean).join(' ')}>
      {href ? <Link to={href} className="ui-chip-label">{children}</Link> : <span className="ui-chip-label">{children}</span>}
      {onRemove && (
        <button type="button" className="ui-chip-remove" aria-label={removeLabel ?? `Remove ${children}`} onClick={onRemove}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
