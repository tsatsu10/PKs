import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { AUDIT_ACTION_LIST } from '../constants';
import './AuditLogs.css';

const PAGE_SIZE = 50;

export default function AuditLogs() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, payload, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (actionFilter) q = q.eq('action', actionFilter);
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00Z`);
      if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59Z`);
      const { data, error } = await q;
      setList(error ? [] : (data || []));
      setLoading(false);
    })();
  }, [user?.id, actionFilter, dateFrom, dateTo]);

  function formatAction(action) {
    return action.replace(/_/g, ' ');
  }

  return (
    <div className="audit-logs-page" id="main-content" role="main">
      <header className="audit-logs-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Audit logs' }]} />
        <h1>Audit logs</h1>
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
        <p className="audit-logs-loading">Loading…</p>
      ) : list.length === 0 ? (
        <p className="audit-logs-empty">No audit entries match your filters.</p>
      ) : (
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
      )}
    </div>
  );
}
