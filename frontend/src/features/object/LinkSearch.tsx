import { useId } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import { formatObjectTypeLabel } from '../../constants';
import type { useLinks } from './hooks/useLinks';
import type { OutgoingLink } from './types';

type Props = {
  links: ReturnType<typeof useLinks>;
  outgoingLinks: OutgoingLink[];
  prefetch: (id: string) => object;
};

/** The header's "Search to link…" box and its results: a plain list of links with a Link button each. */
export default function LinkSearch({ links, outgoingLinks, prefetch }: Props) {
  const { addLink, search } = links;
  const { query, setQuery, results, open, setOpen, containerRef } = search;
  const listId = useId();
  const showPanel = open && (query.trim() !== '' || results.length > 0);
  return (
    <div className="detail-header-link-search" ref={containerRef}>
      <Field label="Search objects to link" labelHidden>
        {(f) => (
          <Input
            id={f.id}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search to link…"
            aria-controls={showPanel && results.length > 0 ? listId : undefined}
          />
        )}
      </Field>
      {showPanel && (
        <div className="detail-link-search-dropdown">
          {results.length === 0 ? (
            <p className="detail-link-search-empty">{query.trim() ? 'No objects found' : 'Type to search'}</p>
          ) : (
            <ul id={listId} className="detail-link-search-list" aria-label="Search results">
              {results.map((o) => (
                <li key={o.id} className="detail-link-search-item">
                  <Link to={`/objects/${o.id}`} className="detail-link-search-title" onClick={() => setOpen(false)} {...prefetch(o.id)}>{o.title}</Link>
                  <span className="detail-link-search-type">{formatObjectTypeLabel(o.type)}</span>
                  {!outgoingLinks.some((l) => l.to_object_id === o.id) ? (
                    <Button variant="primary" size="sm" aria-label={`Link ${o.title}`} onClick={() => { addLink(o.id); setOpen(false); setQuery(''); }}>Link</Button>
                  ) : (
                    <span className="detail-link-search-linked">Linked</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
