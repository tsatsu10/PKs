import { Link } from 'react-router-dom';
import TypeMark from '../../../../components/TypeMark';
import { useActivityPulse } from '../../hooks/useActivityPulse';
import './ActivityPulse.css';

function Sparkline({ values, label, color }) {
  const data = values?.length ? values : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(1, ...data.map((v) => Number(v) || 0));
  const w = 120;
  const h = 28;
  const barW = w / data.length - 2;

  return (
    <div className="activity-pulse-sparkline" role="img" aria-label={`${label} over last 7 days`}>
      <span className="activity-pulse-sparkline-label">{label}</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="activity-pulse-sparkline-svg" aria-hidden="true">
        {data.map((v, i) => {
          const barH = ((Number(v) || 0) / max) * (h - 4);
          return (
            <rect
              key={i}
              x={i * (barW + 2) + 1}
              y={h - barH - 2}
              width={barW}
              height={Math.max(barH, 1)}
              rx={1}
              fill={color}
              opacity={0.85}
            />
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Right-rail activity: sparklines, trending tags, recent links.
 */
export default function ActivityPulse({ userId, heroStats, dueSoonCount = 0, onTagFilter }) {
  const { activity, loading } = useActivityPulse(userId);

  return (
    <aside className="activity-pulse" aria-label="Activity pulse">
      <h3 className="activity-pulse-heading">Activity</h3>

      {dueSoonCount > 0 && (
        <div className="activity-pulse-card">
          <p className="activity-pulse-card-meta">{dueSoonCount} due in the next 7 days</p>
          <Link to="/?due=soon" className="activity-pulse-link">View due soon →</Link>
        </div>
      )}

      <div className="activity-pulse-card" aria-busy={loading}>
        <p className="activity-pulse-card-title">7-day rhythm</p>
        <Sparkline values={activity.capture7d} label="Capture" color="var(--cosmic-pink)" />
        <Sparkline values={activity.tend7d} label="Tend" color="var(--midnight-purple-accent)" />
      </div>

      {activity.trendingTags.length > 0 && (
        <div className="activity-pulse-card">
          <p className="activity-pulse-card-title">Trending tags</p>
          <ul className="activity-pulse-tag-list">
            {activity.trendingTags.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  className="activity-pulse-tag"
                  onClick={() => onTagFilter?.(tag.id, tag.name)}
                >
                  #{tag.name}
                  <span className="activity-pulse-tag-count">{tag.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activity.recentLinks.length > 0 && (
        <div className="activity-pulse-card">
          <p className="activity-pulse-card-title">Recent links</p>
          <ul className="activity-pulse-link-list">
            {activity.recentLinks.map((link) => (
              <li key={link.id}>
                <Link
                  to={`/objects/${link.to_object_id}`}
                  className="activity-pulse-recent-link"
                  title={`${link.from_title} → ${link.to_title}`}
                >
                  <TypeMark type={link.from_type} size="sm" />
                  <span className="activity-pulse-recent-arrow" aria-hidden="true">→</span>
                  <TypeMark type={link.to_type} size="sm" />
                  <span className="activity-pulse-recent-title">{link.to_title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {heroStats?.total != null && (
        <p className="activity-pulse-footnote muted">
          {heroStats.total} object{heroStats.total !== 1 ? 's' : ''} in your library
        </p>
      )}
    </aside>
  );
}
