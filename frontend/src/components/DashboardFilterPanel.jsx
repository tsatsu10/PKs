import { OBJECT_TYPES, OBJECT_STATUSES, formatObjectTypeLabel } from '../constants';
import EntityComboBox from './EntityComboBox';
import Button from './ui/Button';
import Field from './ui/Field';
import Input from './ui/Input';
import Select from './ui/Select';

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
  onCreateDomain,
  onCreateTag,
  onApply,
  onClear,
}) {
  const date = (label, value, set) => (
    <Field label={label}>
      {(f) => <Input id={f.id} type="date" value={value} onChange={(e) => set(e.target.value)} />}
    </Field>
  );
  return (
    <div className="filter-panel" role="group" aria-label="Filters">
      <Field label="Type">
        {(f) => (
          <Select id={f.id} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Any</option>
            {OBJECT_TYPES.map((t) => <option key={t} value={t}>{formatObjectTypeLabel(t)}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Status">
        {(f) => (
          <Select id={f.id} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Any</option>
            {OBJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        )}
      </Field>
      <EntityComboBox label="Domain" value={domainFilter} onChange={setDomainFilter} options={domains} onCreate={onCreateDomain} createLabel="New domain" />
      <EntityComboBox label="Tag" value={tagFilter} onChange={setTagFilter} options={tags} onCreate={onCreateTag} createLabel="New tag" />
      {date('Updated from', dateFrom, setDateFrom)}
      {date('Updated to', dateTo, setDateTo)}
      {date('Due from', dueFrom, setDueFrom)}
      {date('Due to', dueTo, setDueTo)}
      <div className="filter-panel-actions">
        <Button variant="primary" onClick={onApply}>Apply</Button>
        <Button onClick={onClear}>Clear</Button>
      </div>
    </div>
  );
}
