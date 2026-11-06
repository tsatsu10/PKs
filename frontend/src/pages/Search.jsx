import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuth } from '../context/AuthContext';
import Breadcrumbs from '../components/Breadcrumbs';
import DashboardFilterPanel from '../components/DashboardFilterPanel';
import TypeMark from '../components/TypeMark';
import QueryError from '../components/QueryError';
import { createEmptyFiltersOverride, resolveSearchRpcFilters, buildRpcPayload } from '../hooks/useDashboardSearch';
import { useTaxonomy } from '../data/taxonomy';
import { useSearchResults } from '../data/objects';
import { SkeletonList } from '../components/Skeleton';
import './Search.css';

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
  const [showFilters, setShowFilters] = useState(false);
  const listScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  // Filters of the search that actually ran; identical payloads share one cache entry (B11).
  const [applied, setApplied] = useState(null);
  const results = useSearchResults(user?.id ? applied : null);
  const objects = useMemo(() => results.data?.pages.flat() ?? [], [results.data]);
  const loading = results.isPending && applied !== null;
  const loadingMore = results.isFetchingNextPage;
  const hasMore = !!results.hasNextPage;

  const listVirtualizer = useVirtualizer({
    count: objects.length,
    getScrollElement: () => listScrollRef.current,
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
    <div className="search-page">
      <header className="search-header">
        <Breadcrumbs items={[{ label: 'Search', to: '/search' }]} />
        <h1 className="search-title">Search objects</h1>
        <p className="search-desc">Search across titles, summary, content, and tags.</p>
        <form onSubmit={handleSubmit} className="search-form">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            className="search-input"
            aria-label="Search"
            autoFocus
          />
          <button type="submit" className="btn btn-primary">Search</button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            {showFilters ? 'Hide filters' : 'Filters'}
          </button>
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
            <div ref={listScrollRef} className="search-results-scroll" style={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }} role="list" aria-label="Search results">
              <div style={{ height: `${listVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
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
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      role="listitem"
                    >
                      <Link to={`/objects/${o.id}`} className="search-result-link">
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
            <section className="search-empty-state empty-state" aria-label="No results">
              <p className="empty-state-title">No results</p>
              <p className="empty-state-desc">No objects found. Try different keywords or filters.</p>
              <Link to="/objects/new" className="btn btn-primary">Create new object</Link>
            </section>
          )}
          {!loading && objects.length === 0 && !query.trim() && (
            <section className="search-empty-state empty-state" aria-label="No query">
              <p className="empty-state-desc">Enter a search query above to find objects.</p>
              <Link to="/" className="btn btn-secondary">Go to Dashboard</Link>
            </section>
          )}
          {hasMore && (
            <button type="button" className="btn btn-secondary search-load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
