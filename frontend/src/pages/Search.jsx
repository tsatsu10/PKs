import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWindowListVirtualizer } from '../lib/useWindowListVirtualizer';
import { useAuth } from '../context/AuthContext';
import Breadcrumbs from '../components/Breadcrumbs';
import DashboardFilterPanel from '../components/DashboardFilterPanel';
import TypeMark from '../components/TypeMark';
import QueryError from '../components/QueryError';
import { createEmptyFiltersOverride, resolveSearchRpcFilters, buildRpcPayload } from '../hooks/useDashboardSearch';
import { useTaxonomy } from '../data/taxonomy';
import { useSearchResults } from '../data/objects';
import { usePrefetchObject } from '../data/usePrefetchObject';
import { SkeletonList } from '../components/Skeleton';
import './Search.css';
import Button, { ButtonLink } from '../components/ui/Button';
import Page from '../components/ui/Page';
import { Search as SearchIcon, SearchX } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';

export default function Search() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const qFromUrl = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(qFromUrl);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const { domains, tags } = useTaxonomy(user?.id ?? null);
  const prefetch = usePrefetchObject();
  const [showFilters, setShowFilters] = useState(false);
  const listScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  // Filters of the search that actually ran; identical payloads share one cache entry (B11).
  const [applied, setApplied] = useState(null);
  const results = useSearchResults(user?.id ? applied : null);
  const objects = useMemo(() => results.data?.pages.flat() ?? [], [results.data]);
  const loading = results.isPending && applied !== null;
  const loadingMore = results.isFetchingNextPage;
  const hasMore = !!results.hasNextPage;

  // The results scroll with the page, not in their own box (M5).
  const { virtualizer: listVirtualizer, scrollMargin } = useWindowListVirtualizer({
    listRef: listScrollRef,
    count: objects.length,
    estimateSize: () => 72,
    overscan: 5,
  });

  useEffect(() => {
    setQuery(qFromUrl);
  }, [qFromUrl]);

  function runSearch(queryOverride = null, filtersOverride = null) {
    const state = { searchQuery: query, typeFilter, statusFilter, domainFilter, tagFilter, dateFrom, dateTo, dueFrom, dueTo };
    setApplied(buildRpcPayload(resolveSearchRpcFilters(filtersOverride, state, queryOverride)));
  }

  useEffect(() => {
    if (!user?.id) return;
    runSearch(qFromUrl || undefined);
    // Only run when user or URL query changes, not when runSearch identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, qFromUrl]);

  function handleSubmit(e) {
    e.preventDefault();
    const q = query.trim();
    setSearchParams(q ? { q } : {});
  }

  function loadMore() {
    results.fetchNextPage();
  }

  return (
    <Page title="Search objects" width="narrow" className="search-page">
      <header className="search-header">
        <Breadcrumbs items={[{ label: 'Search', to: '/search' }]} />
        <p className="search-desc">Search across titles, summary, content, and tags.</p>
        <form onSubmit={handleSubmit} className="search-form">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            className="search-input"
            aria-label="Search"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the search page exists to type into this field
            autoFocus
          />
          <Button type="submit" variant="primary">Search</Button>
          <Button
           
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            {showFilters ? 'Hide filters' : 'Filters'}
          </Button>
        </form>
        {showFilters && (
          <DashboardFilterPanel
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            domainFilter={domainFilter}
            setDomainFilter={setDomainFilter}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            dueFrom={dueFrom}
            setDueFrom={setDueFrom}
            dueTo={dueTo}
            setDueTo={setDueTo}
            domains={domains}
            tags={tags}
            onApply={() => runSearch(null, {
              searchQuery: query,
              typeFilter,
              statusFilter,
              domainFilter,
              tagFilter,
              dateFrom,
              dateTo,
              dueFrom,
              dueTo,
            })}
            onClear={() => {
              const empty = createEmptyFiltersOverride();
              setTypeFilter('');
              setStatusFilter('');
              setDomainFilter('');
              setTagFilter('');
              setDateFrom('');
              setDateTo('');
              setDueFrom('');
              setDueTo('');
              runSearch('', empty);
            }}
          />
        )}
      </header>

      {results.error && (
        <QueryError what="search results" error={results.error} onRetry={() => results.refetch()} />
      )}

      {loading ? (
        <div className="search-loading" role="status" aria-live="polite">
          <SkeletonList lines={8} />
        </div>
      ) : (
        <>
          {objects.length > 0 && (
            <div ref={listScrollRef} className="search-results-scroll" role="list" aria-label="Search results">
              <div role="presentation" style={{ height: `${listVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {listVirtualizer.getVirtualItems().map((virtualRow) => {
                  const o = objects[virtualRow.index];
                  return (
                    <div
                      key={o.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                      }}
                      role="listitem"
                      aria-posinset={virtualRow.index + 1}
                      aria-setsize={hasMore ? -1 : objects.length}
                    >
                      <Link to={`/objects/${o.id}`} className="search-result-link" {...prefetch(o.id)}>
                        <TypeMark type={o.type} size="sm" className="search-result-type-mark" />
                        <span className="search-result-title">{o.title || 'Untitled'}</span>
                        {(o.snippet || o.summary) && (
                          <span className="search-result-summary">{o.snippet || o.summary}</span>
                        )}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!loading && objects.length === 0 && query.trim() && (
            <EmptyState
              icon={SearchX}
              title="No results"
              description="No objects found. Try different keywords or filters."
              action={<ButtonLink to="/objects/new" variant="primary">Create new object</ButtonLink>}
            />
          )}
          {!loading && objects.length === 0 && !query.trim() && (
            <EmptyState
              icon={SearchIcon}
              title="Enter a search query above to find objects."
              action={<ButtonLink to="/">Go to Dashboard</ButtonLink>}
            />
          )}
          {hasMore && (
            <Button className="search-load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </>
      )}
    </Page>
  );
}
