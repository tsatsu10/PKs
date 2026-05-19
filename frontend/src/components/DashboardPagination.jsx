/**
 * Dashboard list pagination — prev/next and page numbers.
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
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;
  const hasMultiplePages = totalPages > 1 || page > 1;

  const pages = buildPageNumbers(page, totalPages);

  let summary = 'No objects on this page';
  if (itemCount > 0) {
    if (totalCount != null) {
      summary = `Showing ${start}–${end} of ${totalCount}`;
      if (hasMultiplePages) {
        summary += ` · Page ${page} of ${totalPages}`;
      }
    } else {
      summary = `Showing ${start}–${end}`;
      if (hasMultiplePages) {
        summary += ` · Page ${page} of ${totalPages}`;
      }
    }
  }

  return (
    <nav className="dashboard-pagination" aria-label="Object list pages">
      <p className="dashboard-pagination-summary" aria-live="polite">
        {summary}
      </p>
      {hasMultiplePages && (
        <div className="dashboard-pagination-controls">
          <button
            type="button"
            className="btn btn-secondary dashboard-pagination-btn"
            onClick={() => onPageChange(page - 1)}
            disabled={!canPrev}
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <ol className="dashboard-pagination-pages">
            {pages.map((p, i) => (
              p === '…' ? (
                <li key={`ellipsis-${i}`} className="dashboard-pagination-ellipsis" aria-hidden="true">…</li>
              ) : (
                <li key={p}>
                  <button
                    type="button"
                    className={`dashboard-pagination-page${p === page ? ' is-active' : ''}`}
                    onClick={() => onPageChange(p)}
                    disabled={loading || p === page}
                    aria-label={p === page ? `Page ${p}, current` : `Go to page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                </li>
              )
            ))}
          </ol>
          <button
            type="button"
            className="btn btn-secondary dashboard-pagination-btn"
            onClick={() => onPageChange(page + 1)}
            disabled={!canNext}
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      )}
    </nav>
  );
}

/** Compact page number list with ellipses for long ranges. */
function buildPageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…');
    out.push(sorted[i]);
  }
  return out;
}
