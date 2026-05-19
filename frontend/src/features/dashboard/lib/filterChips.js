import { formatObjectTypeLabel } from '../../../constants';

/**
 * Build removable filter chips for ActiveFiltersStrip.
 */
export function buildFilterChips({
  typeFilter,
  statusFilter,
  domainFilter,
  tagFilter,
  dateFrom,
  dateTo,
  dueFrom,
  dueTo,
  domains,
  tags,
  setTypeFilter,
  setStatusFilter,
  setDomainFilter,
  setTagFilter,
  setDateFrom,
  setDateTo,
  setDueFrom,
  setDueTo,
  runSearch,
  searchQuery,
}) {
  /** @type {Array<{ id: string, label: string, onRemove: () => void }>} */
  const chips = [];

  const rerun = (overrides) => {
    runSearch(0, null, {
      searchQuery,
      typeFilter,
      statusFilter,
      domainFilter,
      tagFilter,
      dateFrom,
      dateTo,
      dueFrom,
      dueTo,
      ...overrides,
    });
  };

  if (typeFilter) {
    chips.push({
      id: 'type',
      label: `Type: ${formatObjectTypeLabel(typeFilter)}`,
      onRemove: () => {
        setTypeFilter('');
        rerun({ typeFilter: '' });
      },
    });
  }
  if (statusFilter) {
    chips.push({
      id: 'status',
      label: `Status: ${statusFilter}`,
      onRemove: () => {
        setStatusFilter('');
        rerun({ statusFilter: '' });
      },
    });
  }
  if (domainFilter) {
    const d = domains.find((x) => x.id === domainFilter);
    chips.push({
      id: 'domain',
      label: `Domain: ${d?.name ?? '…'}`,
      onRemove: () => {
        setDomainFilter('');
        rerun({ domainFilter: '' });
      },
    });
  }
  if (tagFilter) {
    const t = tags.find((x) => x.id === tagFilter);
    chips.push({
      id: 'tag',
      label: `Tag: ${t?.name ?? '…'}`,
      onRemove: () => {
        setTagFilter('');
        rerun({ tagFilter: '' });
      },
    });
  }
  if (dateFrom || dateTo) {
    chips.push({
      id: 'updated',
      label: 'Updated: custom',
      onRemove: () => {
        setDateFrom('');
        setDateTo('');
        rerun({ dateFrom: '', dateTo: '' });
      },
    });
  }
  if (dueFrom || dueTo) {
    chips.push({
      id: 'due',
      label: 'Due: custom',
      onRemove: () => {
        setDueFrom('');
        setDueTo('');
        rerun({ dueFrom: '', dueTo: '' });
      },
    });
  }

  return chips;
}
