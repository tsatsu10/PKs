import { OBJECT_TYPES, OBJECT_STATUSES } from '../constants';

/**
 * Filter panel for dashboard search: type, status, domain, tag, date range.
 */
export default function DashboardFilterPanel({
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  domainFilter,
  setDomainFilter,
  tagFilter,
  setTagFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  dueFrom,
  setDueFrom,
  dueTo,
  setDueTo,
  domains,
  tags,
  onApply,
  onClear,
}) {
  return (
    <div className="filter-panel" role="group" aria-label="Search filters">
      <label>
        Type
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Any</option>
          {OBJECT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Any</option>
          {OBJECT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Domain
        <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
          <option value="">Any</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </label>
      <label>
        Tag
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">Any</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label>
        Updated from
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Updated from" />
      </label>
      <label>
        Updated to
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Updated to" />
      </label>
      <label>
        Due from
        <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} aria-label="Due from" />
      </label>
      <label>
        Due to
        <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} aria-label="Due to" />
      </label>
      <button type="button" className="btn btn-secondary" onClick={onApply}>
        Apply
      </button>
      <button type="button" className="btn btn-secondary" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
