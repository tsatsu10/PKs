import { useState } from 'react';
import { Link } from 'react-router-dom';
import TypeMark from '../../../../components/TypeMark';
import { useLinkedObjectsOptional } from '../../context/LinkedObjectsContext';
import './LinkedBar.css';

function truncateTitle(title, max = 14) {
  if (!title) return 'Untitled';
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1)}…`;
}

/**
 * Compact linked-object chips under a row title (Stream / Cards).
 */
export default function LinkedBar({ objectId, runPromptSuffix = '', compact = false }) {
  const linked = useLinkedObjectsOptional();
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!linked || !objectId) return null;

  const data = linked.getLinksFor(objectId);
  if (!data || (data.links.length === 0 && data.total === 0)) return null;

  const { links, total } = data;
  const overflow = Math.max(0, total - links.length);

  return (
    <div className={`linked-bar${compact ? ' linked-bar--compact' : ''}`} aria-label="Linked objects">
      <span className="linked-bar-prefix" aria-hidden="true">↳</span>
      <div className="linked-bar-chips">
        {links.map((link) => (
          <Link
            key={link.id}
            to={`/objects/${link.id}${runPromptSuffix}`}
            className="linked-bar-chip"
            title={link.title}
            onClick={(e) => e.stopPropagation()}
          >
            <TypeMark type={link.type} size="sm" className="linked-bar-chip-mark" />
            <span className="linked-bar-chip-title">{truncateTitle(link.title)}</span>
          </Link>
        ))}
        {overflow > 0 && (
          <div className="linked-bar-overflow-wrap">
            <button
              type="button"
              className="linked-bar-chip linked-bar-chip--more"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPopoverOpen((v) => !v);
              }}
              aria-expanded={popoverOpen}
              aria-haspopup="dialog"
            >
              +{overflow}
            </button>
            {popoverOpen && (
              <div className="linked-bar-popover" role="dialog" aria-label="More linked objects">
                <p className="linked-bar-popover-hint">
                  {total} linked object{total !== 1 ? 's' : ''}. Open the object for the full graph.
                </p>
                <ul className="linked-bar-popover-list">
                  {links.map((link) => (
                    <li key={link.id}>
                      <Link
                        to={`/objects/${link.id}${runPromptSuffix}`}
                        className="linked-bar-popover-link"
                        onClick={() => setPopoverOpen(false)}
                      >
                        <TypeMark type={link.type} size="sm" />
                        <span>{link.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
