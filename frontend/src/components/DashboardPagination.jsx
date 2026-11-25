import Pagination from './ui/Pagination';

/**
 * Dashboard list pagination: the "Showing…" summary plus the shared page controls.
 */
export default function DashboardPagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  itemCount,
  loading,
  onPageChange,
}) {
  const start = itemCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = (page - 1) * pageSize + itemCount;
  const hasMultiplePages = totalPages > 1 || page > 1;

  let summary = 'No objects on this page';
  if (itemCount > 0) {
    summary = totalCount != null ? `Showing ${start}–${end} of ${totalCount}` : `Showing ${start}–${end}`;
    if (hasMultiplePages) summary += ` · Page ${page} of ${totalPages}`;
  }

  return (
    <div className="dashboard-pagination">
      <p className="dashboard-pagination-summary" aria-live="polite">{summary}</p>
      <Pagination label="Objects pages" page={page} totalPages={totalPages} onPageChange={onPageChange} disabled={loading} />
    </div>
  );
}
