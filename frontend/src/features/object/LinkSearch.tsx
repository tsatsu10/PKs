import { Link } from 'react-router-dom';
import { formatObjectTypeLabel } from '../../constants';
import type { useLinks } from './hooks/useLinks';
import type { OutgoingLink } from './types';

type Props = {
  links: ReturnType<typeof useLinks>;
  outgoingLinks: OutgoingLink[];
  prefetch: (id: string) => object;
};

/** The header's "Search to link…" box and its results dropdown. */
export default function LinkSearch({ links, outgoingLinks, prefetch }: Props) {
  const { addLink, search } = links;
  const { query, setQuery, results, open, setOpen, containerRef } = search;
  return (
    <div className="detail-header-link-search" ref={containerRef}>
      <input
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search to link…"
        className="detail-link-search-input"
        aria-label="Search objects to link"
        aria-expanded={open && results.length > 0}
      />
      {open && (query.trim() || results.length > 0) && (
        <div className="detail-link-search-dropdown" role="listbox">
          {results.length === 0 ? (
            <p className="detail-link-search-empty">{query.trim() ? 'No objects found' : 'Type to search'}</p>
          ) : (
            results.map((o) => (
              <div key={o.id} className="detail-link-search-item">
                <Link to={`/objects/${o.id}`} className="detail-link-search-title" onClick={() => setOpen(false)} {...prefetch(o.id)}>{o.title}</Link>
                <span className="detail-link-search-type">{formatObjectTypeLabel(o.type)}</span>
                {!outgoingLinks.some((l) => l.to_object_id === o.id) ? (
                  <button type="button" className="btn btn-primary btn-small" onClick={() => { addLink(o.id); setOpen(false); setQuery(''); }}>Link</button>
                ) : (
                  <span className="detail-link-search-linked">Linked</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
