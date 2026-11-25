import Trailhead from './Trailhead';
import './TrailheadRow.css';

/**
 * Resume → Pending → Spark fallback chain (omit empty slots).
 */
export default function TrailheadRow({ resumeObject, pendingObject, sparkObject, runPromptSuffix = '' }) {
  const to = (id) => `/objects/${id}${runPromptSuffix}`;

  const cards = [
    resumeObject ? { kind: 'resume', object: resumeObject, shortcutDigit: '1' } : null,
    pendingObject ? { kind: 'pending', object: pendingObject, shortcutDigit: '2' } : null,
    sparkObject ? { kind: 'spark', object: sparkObject, shortcutDigit: '3' } : null,
  ].filter(Boolean);

  if (cards.length === 0) return null;

  return (
    <div className="trailhead-row" role="group" aria-label="Suggested next steps">
      {cards.map((card) => (
        <Trailhead
          key={card.kind}
          kind={card.kind}
          object={card.object}
          shortcutDigit={card.shortcutDigit}
          to={to(card.object.id)}
        />
      ))}
    </div>
  );
}
