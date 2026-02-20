import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { OBJECT_TYPE_ICONS } from '../constants';
import './DashboardStats.css';

/**
 * Dashboard overview: fetches and displays stats (total, activity, due) and optional breakdown by type/status.
 * Styled to match the main dashboard (glass cards, cosmic-pink accents, same spacing).
 */
export default function DashboardStats({ userId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase
      .rpc('get_dashboard_stats')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setStats(null);
          return;
        }
        setStats(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  if (!userId) return null;

  if (loading) {
    return (
      <section className="dashboard-overview" aria-label="Overview">
        <h2 className="dashboard-overview-title">Overview</h2>
        <div className="dashboard-overview-cards" aria-hidden="true">
          <div className="dashboard-overview-card dashboard-overview-card-skeleton" />
          <div className="dashboard-overview-card dashboard-overview-card-skeleton" />
          <div className="dashboard-overview-card dashboard-overview-card-skeleton" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="dashboard-overview dashboard-overview-error" aria-label="Overview">
        <h2 className="dashboard-overview-title">Overview</h2>
        <p className="dashboard-overview-error-text">Stats unavailable. Check your connection.</p>
      </section>
    );
  }

  if (!stats) return null;

  const total = stats.total ?? 0;
  const updated7 = stats.updated_last_7_days ?? 0;
  const due7 = stats.due_next_7_days ?? 0;
  const byType = stats.by_type && typeof stats.by_type === 'object' ? stats.by_type : {};
  const byStatus = stats.by_status && typeof stats.by_status === 'object' ? stats.by_status : {};
  const typeKeys = Object.keys(byType);
  const statusKeys = Object.keys(byStatus);
  const hasBreakdown = typeKeys.length > 0 || statusKeys.length > 0;
  const defaultBreakdownOpen = hasBreakdown && (typeKeys.length > 1 || statusKeys.length > 1);
  const breakdownTeaser =
    hasBreakdown && (typeKeys.length > 0 || statusKeys.length > 0)
      ? [
          typeKeys.length > 0 &&
            typeKeys
              .sort((a, b) => (byType[b] || 0) - (byType[a] || 0))
              .slice(0, 3)
              .map((t) => `${t.replace(/_/g, ' ')}: ${byType[t]}`)
              .join(', '),
          statusKeys.length > 0 &&
            statusKeys
              .sort((a, b) => (byStatus[b] || 0) - (byStatus[a] || 0))
              .slice(0, 2)
              .map((s) => `${s}: ${byStatus[s]}`)
              .join(', '),
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  return (
    <section className="dashboard-overview" aria-label="Overview">
      <h2 className="dashboard-overview-title">Overview</h2>
      <div className="dashboard-overview-cards">
        <Link
          to="/"
          className="dashboard-overview-card dashboard-overview-card-primary dashboard-overview-card-link"
          aria-label={`${total} total objects. View all.`}
        >
          <span className="dashboard-overview-value">{total}</span>
          <span className="dashboard-overview-label">Total objects</span>
        </Link>
        <div className="dashboard-overview-card dashboard-overview-card-updated" aria-label={`${updated7} updated in last 7 days`}>
          <span className="dashboard-overview-value">{updated7}</span>
          <span className="dashboard-overview-label" title="Updated in last 7 days">Updated (7d)</span>
          {updated7 > 0 && (
            <Link to="/?updated=7d" className="dashboard-overview-link">
              View recent
            </Link>
          )}
        </div>
        <div className="dashboard-overview-card dashboard-overview-card-due" aria-label={`${due7} due in next 7 days`}>
          <span className="dashboard-overview-value">{due7}</span>
          <span className="dashboard-overview-label" title="Due in next 7 days">Due (7d)</span>
          {due7 > 0 ? (
            <Link to="/?due=soon" className="dashboard-overview-link" aria-label="View objects due in the next 7 days">
              View due soon
            </Link>
          ) : (
            <span className="dashboard-overview-hint" title="Add due dates on objects to see them here">
              Nothing due soon
            </span>
          )}
        </div>
      </div>
      {total === 0 && (
        <div className="dashboard-overview-empty-card">
          <p className="dashboard-overview-empty-text">No objects yet.</p>
          <Link to="/objects/new" className="btn btn-primary dashboard-overview-empty-cta">
            Create your first object
          </Link>
        </div>
      )}
      {hasBreakdown && (
        <details className="dashboard-overview-breakdown" open={defaultBreakdownOpen}>
          <summary className="dashboard-overview-breakdown-summary" title="Expand to see breakdown by type and status">
            {breakdownTeaser ? `Analysis by type & status — ${breakdownTeaser}` : 'Analysis by type & status'}
          </summary>
          <div className="dashboard-overview-breakdown-inner">
            {typeKeys.length > 0 && (
              <div className="dashboard-overview-breakdown-block">
                <h3 className="dashboard-overview-breakdown-heading">By type</h3>
                <ul className="dashboard-overview-breakdown-list">
                  {Object.entries(byType)
                    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                    .map(([type, count]) => (
                      <li key={type} className="dashboard-overview-breakdown-item">
                        <Link to={`/?type=${encodeURIComponent(type)}`} className="dashboard-overview-breakdown-link">
                          <span className="dashboard-overview-breakdown-icon" aria-hidden="true">
                            {OBJECT_TYPE_ICONS[type] ?? '📄'}
                          </span>
                          <span className="dashboard-overview-breakdown-name">{type.replace(/_/g, ' ')}</span>
                          <span className="dashboard-overview-breakdown-count">{count}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {statusKeys.length > 0 && (
              <div className="dashboard-overview-breakdown-block">
                <h3 className="dashboard-overview-breakdown-heading">By status</h3>
                <ul className="dashboard-overview-breakdown-list">
                  {Object.entries(byStatus)
                    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                    .map(([status, count]) => (
                      <li key={status} className="dashboard-overview-breakdown-item">
                        <Link to={`/?status=${encodeURIComponent(status)}`} className="dashboard-overview-breakdown-link">
                          <span className="dashboard-overview-breakdown-name">{status}</span>
                          <span className="dashboard-overview-breakdown-count">{count}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
