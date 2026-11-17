import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildPageNumbers } from '../../lib/pageNumbers';
import Button from './Button';
import './Pagination.css';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
  disabled?: boolean;
}

/** Page controls only; the caller owns any "Showing…" summary. */
export default function Pagination({ page, totalPages, onPageChange, label, disabled = false }: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = buildPageNumbers(page, totalPages);
  return (
    <nav aria-label={label} className="ui-pagination">
      <Button size="sm" variant="ghost" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft size={16} aria-hidden="true" />
        Previous
      </Button>
      <ul className="ui-pagination-pages">
        {pages.map((p, i) =>
          p === '…' ? (
            <li key={`gap-${i}`} className="ui-pagination-gap" aria-hidden="true">…</li>
          ) : (
            <li key={p}>
              <Button
                size="sm"
                variant={p === page ? 'primary' : 'ghost'}
                aria-label={`Page ${p}`}
                aria-current={p === page ? 'page' : undefined}
                disabled={disabled}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            </li>
          ),
        )}
      </ul>
      <Button size="sm" variant="ghost" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
        <ChevronRight size={16} aria-hidden="true" />
      </Button>
    </nav>
  );
}
