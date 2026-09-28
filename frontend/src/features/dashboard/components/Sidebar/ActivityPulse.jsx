import { Link } from 'react-router-dom';
import TypeMark from '../../../../components/TypeMark';
import { useActivityPulse } from '../../hooks/useActivityPulse';
import './ActivityPulse.css';

/**
 * Right-rail activity: trending tags, recent links.
 */
export default function ActivityPulse({ userId, heroStats, dueSoonCount = 0, onTagFilter }) {
  const { activity } = useActivityPulse(userId);

  return (
    <aside className="activity-pulse" aria-label="Activity pulse">
      <h3 className="activity-pulse-heading">Activity</h3>

      {dueSoonCount > 0 && (
        <div className="activity-pulse-card">
          <p className="activity-pulse-card-meta">{dueSoonCount} due in the next 7 days</p>
          <Link to="/?due=soon" className="activity-pulse-link">View due soon →</Link>
        </div>
      )}

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
