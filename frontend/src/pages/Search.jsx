import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Breadcrumbs from '../components/Breadcrumbs';
import DashboardFilterPanel from '../components/DashboardFilterPanel';
import { OBJECT_TYPE_ICONS } from '../constants';
import { measureSearchStart, measureSearchEnd } from '../lib/performance';
import './Search.css';

const PAGE_SIZE = 20;

export default function Search() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const qFromUrl = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(qFromUrl);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [domains, setDomains] = useState([]);
  const [tags, setTags] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setQuery(qFromUrl);
  }, [qFromUrl]);

  const runSearch = useCallback(async (nextOffset = 0, queryOverride = null) => {
    if (!user?.id) return;
    const q = (queryOverride !== null && queryOverride !== undefined ? String(queryOverride) : query).trim();
    const isLoadMore = nextOffset > 0;
    if (!isLoadMore) setLoading(true);
    else setLoadingMore(true);
    setError('');
    measureSearchStart();
    try {
      const { data, error: err } = await supabase.rpc(
        q ? 'search_knowledge_objects_with_snippets' : 'search_knowledge_objects',
        {
          search_query: q || null,
          type_filter: typeFilter || null,
          domain_id_f: domainFilter || null,
          tag_id_f: tagFilter || null,
          date_from_f: dateFrom ? `${dateFrom}T00:00:00Z` : null,
          date_to_f: dateTo ? `${dateTo}T23:59:59Z` : null,
          status_filter: statusFilter || null,
          due_from_f: dueFrom ? `${dueFrom}T00:00:00Z` : null,
          due_to_f: dueTo ? `${dueTo}T23:59:59Z` : null,
          limit_n: PAGE_SIZE,
          offset_n: nextOffset,
        }
      );
      if (err) throw err;
      const list = data || [];
      if (isLoadMore) setObjects((prev) => [...prev, ...list]);
      else setObjects(list);
      setHasMore(list.length === PAGE_SIZE);
      setOffset(nextOffset + list.length);
    } catch (e) {
      setError(e?.message ?? 'Search failed');
      if (!isLoadMore) setObjects([]);
    } finally {
      measureSearchEnd();
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user?.id, query, typeFilter, statusFilter, domainFilter, tagFilter, dateFrom, dateTo, dueFrom, dueTo]);

  useEffect(() => {
    if (!user?.id) return;
    runSearch(0, qFromUrl || undefined);
  }, [user?.id, qFromUrl]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [dRes, tRes] = await Promise.all([
        supabase.from('domains').select('id, name').eq('user_id', user.id).order('name'),
        supabase.from('tags').select('id, name').eq('user_id', user.id).order('name'),
      ]);
      setDomains(dRes.data || []);
      setTags(tRes.data || []);
    })();
  }, [user?.id]);

  function handleSubmit(e) {
    e.preventDefault();
    const q = query.trim();
    setSearchParams(q ? { q } : {});
    runSearch(0, q);
  }

  function loadMore() {
    runSearch(offset);
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
            onApply={() => runSearch(0)}
            onClear={() => {
              setTypeFilter('');
              setStatusFilter('');
              setDomainFilter('');
              setTagFilter('');
              setDateFrom('');
              setDateTo('');
              setDueFrom('');
              setDueTo('');
              runSearch(0);
            }}
          />
        )}
      </header>

      {error && <div className="search-error" role="alert">{error}</div>}

      {loading ? (
        <p className="search-loading">Searching…</p>
      ) : (
        <>
          <ul className="search-results">
            {objects.map((o) => (
              <li key={o.id}>
                <Link to={`/objects/${o.id}`} className="search-result-link">
                  <span className="search-result-type" aria-hidden>
                    {OBJECT_TYPE_ICONS[o.type] ?? '•'}
                  </span>
                  <span className="search-result-title">{o.title || 'Untitled'}</span>
                  {(o.snippet || o.summary) && (
                    <span className="search-result-summary">{o.snippet || o.summary}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {!loading && objects.length === 0 && query.trim() && (
            <section className="search-empty-state" aria-label="No results">
              <p className="search-empty">No objects found. Try different keywords or filters.</p>
              <Link to="/objects/new" className="btn btn-primary">Create new object</Link>
            </section>
          )}
          {!loading && objects.length === 0 && !query.trim() && (
            <section className="search-empty-state" aria-label="No query">
              <p className="search-empty">Enter a search query above to find objects.</p>
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
