import { useState } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { AUDIT_ACTION_LIST } from '../constants';
import { SkeletonList } from '../components/Skeleton';
import QueryError from '../components/QueryError';
import LoadMore from '../components/LoadMore';
import { useAuditLogs } from '../data/auditLogs';
import './AuditLogs.css';
import Page from '../components/ui/Page';

export default function AuditLogs() {
  const { user } = useAuth();
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { rows: list, query } = useAuditLogs(user?.id ?? null, { action: actionFilter, dateFrom, dateTo });
  const loading = query.isPending;

  function formatAction(action) {
    return action.replace(/_/g, ' ');
  }

  return (
    <Page title="Audit logs" width="narrow" className="audit-logs-page">
      <header className="audit-logs-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Audit logs' }]} />
        <p className="audit-logs-desc">History of key actions on your knowledge objects.</p>
        <div className="audit-logs-filters">
          <label>
            Action
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">All</option>
              {AUDIT_ACTION_LIST.map((a) => (
                <option key={a} value={a}>{formatAction(a)}</option>
              ))}
            </select>
          </label>
          <label>
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
      </header>
      {loading ? (
        <div className="audit-logs-loading" role="status" aria-live="polite">
          <SkeletonList lines={8} />
        </div>
      ) : query.error ? (
        <QueryError what="audit logs" error={query.error} onRetry={() => query.refetch()} />
      ) : list.length === 0 ? (
        <section className="audit-logs-empty" aria-label="No audit entries">
          <p>No audit entries match your filters.</p>
          <Link to="/">Back to Dashboard</Link>
        </section>
      ) : (
        <>
        <ul className="audit-logs-list">
          {list.map((entry) => (
            <li key={entry.id} className="audit-logs-item">
              <span className="audit-logs-action">{formatAction(entry.action)}</span>
              <span className="audit-logs-entity">{entry.entity_type}{entry.entity_id ? ` ${entry.entity_id.slice(0, 8)}…` : ''}</span>
              {entry.payload && typeof entry.payload === 'object' && Object.keys(entry.payload).length > 0 && (
                <span className="audit-logs-payload">
                  {entry.payload.title && `"${String(entry.payload.title).slice(0, 40)}${entry.payload.title.length > 40 ? '…' : ''}"`}
                  {entry.payload.format && ` · ${entry.payload.format}`}
                </span>
              )}
              <span className="audit-logs-time">{new Date(entry.created_at).toLocaleString()}</span>
              {entry.entity_type === 'knowledge_object' && entry.entity_id && (
                <Link to={`/objects/${entry.entity_id}`} className="audit-logs-link">View</Link>
              )}
            </li>
          ))}
        </ul>
        <LoadMore query={query} />
        </>
      )}
    </Page>
  );
}
