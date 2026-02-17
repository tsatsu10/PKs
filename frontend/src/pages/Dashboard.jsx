import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SkeletonList } from '../components/Skeleton';
import { OBJECT_TYPES, OBJECT_TYPE_ICONS } from '../constants';
import { createNotification } from '../lib/notifications';
import { logAudit } from '../lib/audit';
import { useToast } from '../context/ToastContext';
import { getExportIncludeFromTemplate, buildObjectMarkdown } from '../lib/export';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants';
import JSZip from 'jszip';
import './Dashboard.css';

const PAGE_SIZE = 20;

export default function Dashboard() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [domains, setDomains] = useState([]);
  const [tags, setTags] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'card'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('md');
  const [exportTemplate, setExportTemplate] = useState('full');
  const [exporting, setExporting] = useState(false);
  const [searchParams] = useSearchParams();
  const qFromUrl = searchParams.get('q') ?? '';
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (qFromUrl !== searchQuery) setSearchQuery(qFromUrl);
  }, [qFromUrl]);

  const runSearch = useCallback(async (nextOffset = 0, queryOverride = null) => {
    if (!user?.id) return;
    const isLoadMore = nextOffset > 0;
    const q = queryOverride !== null && queryOverride !== undefined ? String(queryOverride).trim() : searchQuery.trim();
    if (!isLoadMore) setLoading(true);
    else setLoadingMore(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('search_knowledge_objects', {
        search_query: q || null,
        type_filter: typeFilter || null,
        domain_id_f: domainFilter || null,
        tag_id_f: tagFilter || null,
        date_from_f: dateFrom ? `${dateFrom}T00:00:00Z` : null,
        date_to_f: dateTo ? `${dateTo}T23:59:59Z` : null,
        limit_n: PAGE_SIZE,
        offset_n: nextOffset,
      });
      if (err) throw err;
      const list = data || [];
      if (isLoadMore) {
        setObjects((prev) => [...prev, ...list]);
      } else {
        setObjects(list);
      }
      setHasMore(list.length === PAGE_SIZE);
      setOffset(nextOffset + list.length);
    } catch (e) {
      setError(e.message || 'Search failed');
      if (!isLoadMore) setObjects([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user?.id, searchQuery, typeFilter, domainFilter, tagFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!user?.id) return;
    runSearch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run search only when user becomes available
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && qFromUrl) runSearch(0, qFromUrl);
  }, [user?.id, qFromUrl]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

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

  function handleSearchSubmit(e) {
    e.preventDefault();
    runSearch(0);
  }

  function handleLoadMore() {
    runSearch(offset);
  }

  function clearFilters() {
    setSearchQuery('');
    setTypeFilter('');
    setDomainFilter('');
    setTagFilter('');
    setDateFrom('');
    setDateTo('');
    runSearch(0);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOnPage() {
    setSelectedIds(new Set(objects.map((o) => o.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleExportSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setExporting(true);
    setError('');
    let jobId = null;
    try {
      const include = getExportIncludeFromTemplate(exportTemplate, { includeLinks: false });
      const { data: job, error: jobErr } = await supabase.from('export_jobs').insert({
        user_id: user.id,
        knowledge_object_id: null,
        format: exportFormat,
        template: exportTemplate,
        include_content: include.content,
        include_summary: include.summary,
        include_key_points: include.key_points,
        include_tags: include.tags,
        include_domains: include.domains,
        include_links: false,
        filename: `export-${ids.length}-objects.zip`,
        status: 'processing',
      }).select('id').single();
      if (jobErr) throw jobErr;
      jobId = job?.id;
      await supabase.from('export_job_items').insert(ids.map((knowledge_object_id, i) => ({ export_job_id: jobId, knowledge_object_id, sort_order: i })));

      const { data: objs } = await supabase.from('knowledge_objects').select('*').in('id', ids);
      if (!objs?.length) throw new Error('No objects found');
      const objMap = Object.fromEntries(objs.map((o) => [o.id, o]));
      const [kodRes, kotRes] = await Promise.all([
        supabase.from('knowledge_object_domains').select('knowledge_object_id, domain_id, domains(id, name)').in('knowledge_object_id', ids),
        supabase.from('knowledge_object_tags').select('knowledge_object_id, tag_id, tags(id, name)').in('knowledge_object_id', ids),
      ]);
      const domainsByObj = {};
      (kodRes.data || []).forEach((r) => {
        if (!domainsByObj[r.knowledge_object_id]) domainsByObj[r.knowledge_object_id] = [];
        if (r.domains) domainsByObj[r.knowledge_object_id].push(r.domains);
      });
      const tagsByObj = {};
      (kotRes.data || []).forEach((r) => {
        if (!tagsByObj[r.knowledge_object_id]) tagsByObj[r.knowledge_object_id] = [];
        if (r.tags) tagsByObj[r.knowledge_object_id].push(r.tags);
      });
      ids.forEach((id) => {
        if (objMap[id]) {
          objMap[id].domains = domainsByObj[id] || [];
          objMap[id].tags = tagsByObj[id] || [];
        }
      });

      const zip = new JSZip();
      ids.forEach((id) => {
        const obj = objMap[id];
        if (!obj) return;
        const slug = obj.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 50);
        const ext = exportFormat === 'txt' ? 'txt' : 'md';
        const text = buildObjectMarkdown(obj, include, { asPlainText: exportFormat === 'txt' });
        zip.file(`${slug}.${ext}`, text);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pks-export-${ids.length}-objects.zip`;
      a.click();
      URL.revokeObjectURL(a.href);

      await supabase.from('export_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', jobId);
      createNotification(user.id, 'export_completed', 'Bundle export completed', `${ids.length} objects exported as ZIP`, {});
      logAudit(user.id, AUDIT_ACTIONS.EXPORT_RUN, AUDIT_ENTITY_TYPES.EXPORT_JOB, jobId, { objectCount: ids.length, format: exportFormat });
      addToast('success', `Exported ${ids.length} objects`);
      setShowExportModal(false);
      clearSelection();
    } catch (err) {
      const msg = err.message || 'Export failed';
      if (jobId) await supabase.from('export_jobs').update({ status: 'failed', error_message: msg }).eq('id', jobId);
      setError(msg);
      addToast('error', msg);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="dashboard">
      <main className="dashboard-main" aria-busy={loading} aria-live="polite">
        <section className="dashboard-actions">
          <h2>Knowledge objects</h2>
          <div className="dashboard-actions-right">
            {selectedIds.size > 0 && (
              <span className="dashboard-selection-actions">
                <span className="muted">{selectedIds.size} selected</span>
                <button type="button" className="btn btn-secondary" onClick={() => setShowExportModal(true)}>Export selected</button>
                <button type="button" className="btn btn-secondary" onClick={selectAllOnPage}>Select all on page</button>
                <button type="button" className="btn btn-secondary" onClick={clearSelection}>Clear</button>
              </span>
            )}
            <div className="view-toggle" role="group" aria-label="View mode">
              <button type="button" className={`btn btn-secondary btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view">≡</button>
              <button type="button" className={`btn btn-secondary btn-icon ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')} aria-pressed={viewMode === 'card'} title="Card view">▦</button>
            </div>
            <Link to="/quick" className="btn btn-secondary">Quick capture</Link>
            <Link to="/objects/new" className="btn btn-primary">New object</Link>
          </div>
        </section>

        <form onSubmit={handleSearchSubmit} className="search-bar">
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, summary, content, tags… (press / to focus)"
            className="search-input"
            aria-label="Search"
          />
          <button type="submit" className="btn btn-primary">Search</button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
          >
            {showFilters ? 'Hide filters' : 'Filters'}
          </button>
        </form>

        {showFilters && (
          <div className="filter-panel" role="group" aria-label="Search filters">
            <label>
              Type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Any</option>
                {OBJECT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Domain
              <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
                <option value="">Any</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <label>
              Tag
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                <option value="">Any</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label>
              Updated from
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              Updated to
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <button type="button" className="btn btn-secondary" onClick={() => runSearch(0)}>
              Apply
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Clear
            </button>
          </div>
        )}

        {error && (
          <div className="dashboard-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        {loading ? (
          <SkeletonList lines={8} />
        ) : objects.length === 0 ? (
          <section className="dashboard-empty" aria-label="No results">
            <p className="dashboard-empty-value">Turn what you learn into reusable knowledge — capture once, use everywhere.</p>
            <p className="dashboard-muted">No objects match. Try different search terms or adjust the filters above.</p>
            <Link to="/objects/new" className="btn btn-primary">Create your first object</Link>
          </section>
        ) : (
          <>
            {viewMode === 'card' ? (
              <div className="object-grid" aria-label="Knowledge objects">
                {objects.map((obj) => (
                  <div key={obj.id} className="object-card-wrapper">
                    <label className="object-card-checkbox">
                      <input type="checkbox" checked={selectedIds.has(obj.id)} onChange={() => toggleSelect(obj.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${obj.title}`} />
                    </label>
                    <Link to={`/objects/${obj.id}`} className="object-card" aria-label={`${obj.title}, ${obj.type}, version ${obj.current_version}`}>
                      <span className="object-card-type" title={obj.type}>
                        <span className="object-card-type-icon" aria-hidden="true">{OBJECT_TYPE_ICONS[obj.type] ?? '📄'}</span>
                        {obj.type}
                      </span>
                      <span className="object-card-title">{obj.title}</span>
                      {obj.summary && <span className="object-card-summary">{obj.summary}</span>}
                      <span className="object-card-meta">v{obj.current_version} · {new Date(obj.updated_at).toLocaleDateString()}</span>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="object-list" aria-label="Knowledge objects">
                {objects.map((obj) => (
                  <li key={obj.id} className="object-list-item-with-checkbox">
                    <label className="object-list-checkbox">
                      <input type="checkbox" checked={selectedIds.has(obj.id)} onChange={() => toggleSelect(obj.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${obj.title}`} />
                    </label>
                    <Link to={`/objects/${obj.id}`} className="object-list-link" aria-label={`${obj.title}, ${obj.type}, version ${obj.current_version}`}>
                      <span className="object-list-type" title={obj.type}>
                        <span className="object-list-type-icon" aria-hidden="true">{OBJECT_TYPE_ICONS[obj.type] ?? '📄'}</span>
                        {obj.type}
                      </span>
                      <span className="object-list-title">{obj.title}</span>
                      {obj.summary && <span className="object-list-summary">{obj.summary}</span>}
                      <span className="object-list-meta">v{obj.current_version} · {new Date(obj.updated_at).toLocaleDateString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {hasMore && (
              <div className="load-more">
                <button type="button" className="btn btn-secondary" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}

        {showExportModal && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
            <div className="dashboard-modal">
              <h2 id="export-modal-title">Export {selectedIds.size} objects</h2>
              <p className="muted">Download as a ZIP with one file per object.</p>
              <label>
                Format
                <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                  <option value="txt">TXT</option>
                  <option value="md">Markdown</option>
                </select>
              </label>
              <label>
                Template
                <select value={exportTemplate} onChange={(e) => setExportTemplate(e.target.value)}>
                  <option value="raw">Raw (content only)</option>
                  <option value="brief">Brief (summary + key points)</option>
                  <option value="full">Full</option>
                  <option value="stakeholder">Stakeholder</option>
                </select>
              </label>
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowExportModal(false)} disabled={exporting}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleExportSelected} disabled={exporting}>
                  {exporting ? 'Exporting…' : 'Export ZIP'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
