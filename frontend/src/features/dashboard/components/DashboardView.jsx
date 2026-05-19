import { Link } from 'react-router-dom';
import { SkeletonList } from '../../../components/Skeleton';
import DashboardFilterPanel from '../../../components/DashboardFilterPanel';
import DashboardQuickAddForm from '../../../components/DashboardQuickAddForm';
import DashboardHero from './Hero/DashboardHero';
import CommandBar from './Toolbar/CommandBar';
import ActiveFiltersStrip from './Toolbar/ActiveFiltersStrip';
import BulkActionRibbon from './Selection/BulkActionRibbon';
import TimelineRow from './Views/TimelineRow';
import StreamBucketHeader from './Views/StreamBucketHeader';
import TableViewRow from './Views/TableView';
import { LinkedObjectsProvider } from '../context/LinkedObjectsContext';
import ActivityPulse from './Sidebar/ActivityPulse';
import { DashboardEmptyFirstRun, DashboardEmptyNoResults } from './Empty/DashboardEmptyStates';
import DashboardObjectCard from '../../../components/DashboardObjectCard';
import DashboardPagination from '../../../components/DashboardPagination';
import DashboardCommandPalette from './DashboardCommandPalette';
import DashboardModals from './DashboardModals';

export default function DashboardView(props) {
  const {
    user, navigate, location, loading, error, objects, searchQuery, setSearchQuery,
    typeFilter, setTypeFilter, statusFilter, setStatusFilter, domainFilter, setDomainFilter,
    tagFilter, setTagFilter, dateFrom, setDateFrom, dateTo, setDateTo, dueFrom, setDueFrom,
    dueTo, setDueTo, runSearch, clearFilters, domains, tags, createDomainInline, createTagInline,
    page, totalPages, totalCount, pageSize, hasActiveFilters, showFilters, setShowFilters,
    viewMode, setViewMode, listDensity, setListDensity, selectedIds, showExportModal,
    setShowExportModal, exportScope, setExportScope, exportFormat, setExportFormat,
    exportTemplate, setExportTemplate, exporting, showQuickAdd, setShowQuickAdd,
    showCommandPalette, setShowCommandPalette, commandPaletteQuery, setCommandPaletteQuery,
    commandPaletteSelected, setCommandPaletteSelected, commandPaletteInputRef,
    commandPaletteFilteredLengthRef, commandPaletteActionsRef, scrollProgress, savedFilters,
    showSaveFilterModal, setShowSaveFilterModal, saveFilterName, setSaveFilterName,
    showSavedFiltersDropdown, setShowSavedFiltersDropdown, savedFiltersDropdownRef,
    previousFocusRef, quickAddTitle, setQuickAddTitle, quickAddContent, setQuickAddContent,
    quickAddSaving, bulkModal, setBulkModal, bulkDomainId, setBulkDomainId, bulkTagId,
    setBulkTagId, bulkType, setBulkType, bulkStatus, setBulkStatus, bulkActionLoading,
    searchInputRef, quickAddInputRef, listScrollRef, cardColumns, runPromptTemplate,
    heroStats, showActivityPanel, setShowActivityPanel, pendingObject, sparkObject,
    resumeObject, pulseValues, pulseTargets, pulseLoading, celebrateRing,
    selectionMode, runPromptSuffix, streamItems, listVirtualizer, filterChips, handlePageChange,
    dismissRunPromptBanner, closeQuickAdd, handleTagFilterFromActivity, handleSearchSubmit,
    toggleSelect, selectAllOnPage, clearSelection, handleQuickAddCreate, handleExportSelected,
    bulkAddDomain, bulkAddTag, bulkRemoveDomain, bulkRemoveTag, bulkDelete, bulkChangeType,
    bulkSetStatus, dismissOnboarding, saveCurrentFilters, applySavedFilter, deleteSavedFilter,
    showBanner, bannerKind, showOnboarding
  } = props;

  return (

    <div className="dashboard">
      <div className="dashboard-main" aria-busy={loading} aria-label="Dashboard">
        <div className="dashboard-sr-only" aria-live="polite" aria-atomic="true">
          {selectedIds.size > 0 ? `${selectedIds.size} object${selectedIds.size !== 1 ? 's' : ''} selected` : ''}
        </div>
        <a href="#dashboard-object-list" className="dashboard-skip-link">Skip to object list</a>
        <div className="dashboard-scroll-progress" role="presentation" aria-hidden="true">
          <div className="dashboard-scroll-progress-bar" style={{ width: `${scrollProgress}%` }} />
        </div>
        <LinkedObjectsProvider userId={user?.id ?? null} scrollRootRef={listScrollRef}>
        <div className="dashboard-layout">
          <div className="dashboard-main-col">
        <DashboardHero
          displayName={user?.displayName}
          celebrateRing={celebrateRing}
          pulseValues={pulseValues}
          pulseTargets={pulseTargets}
          pulseLoading={pulseLoading}
          resumeObject={resumeObject}
          pendingObject={pendingObject}
          sparkObject={sparkObject}
          runPromptSuffix={runPromptSuffix}
          isFirstRun={(heroStats?.total ?? objects.length) === 0 && !loading}
        />

        {/* Single dismissible banner: run-prompt or onboarding */}
        {showBanner && (
          <div className="dashboard-banner" role="region" aria-label={bannerKind === 'run-prompt' ? 'Run prompt' : 'Getting started'}>
            {bannerKind === 'run-prompt' ? (
              <>
                <span className="dashboard-banner-text">
                  Run prompt: <strong>{runPromptTemplate.name}</strong>. Open an object to run this prompt.
                </span>
                <button type="button" className="btn btn-ghost btn-small" onClick={dismissRunPromptBanner} aria-label="Dismiss">Dismiss</button>
              </>
            ) : (
              <>
                <h3 className="dashboard-banner-title">Getting started</h3>
                <ol className="dashboard-banner-steps">
                  <li><Link to="/objects/new">Create your first object</Link> — a note or reference.</li>
                  <li>Use <strong>More filters</strong> to add a domain or tag without leaving the dashboard.</li>
                  <li><Link to="/quick">Try Quick capture</Link> to capture a thought in seconds.</li>
                </ol>
                <button type="button" className="btn btn-secondary btn-small" onClick={dismissOnboarding}>Got it</button>
              </>
            )}
          </div>
        )}

        {/* Suggested next step when few objects and no domains */}
        {heroStats && (heroStats.total ?? 0) <= 5 && domains.length === 0 && (heroStats.total ?? 0) > 0 && (
          <p className="dashboard-suggested-next">
            <button type="button" className="dashboard-suggested-next-btn" onClick={() => setShowFilters(true)}>
              Add a domain in filters
            </button>
            {' '}to organize by topic.
          </p>
        )}

        {/* Mobile-only: Due soon + Recent (sidebar is hidden below 1024px) */}
        <div className="dashboard-mobile-quick-links" aria-label="Quick links">
          {heroStats && (heroStats.due_next_7_days ?? 0) > 0 && (
            <div className="dashboard-mobile-quick-links-card">
              <Link to="/?due=soon" className="dashboard-mobile-quick-links-link">Due soon ({heroStats.due_next_7_days}) →</Link>
            </div>
          )}
          {!loading && objects.length > 0 && (
            <div className="dashboard-mobile-quick-links-card">
              <span className="dashboard-mobile-quick-links-label">Recent</span>
              <ul className="dashboard-mobile-quick-links-list">
                {objects.slice(0, 3).map((o) => (
                  <li key={o.id}><Link to={`/objects/${o.id}`} className="dashboard-mobile-quick-links-link">{o.title}</Link></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <section className="dashboard-actions dashboard-actions--compact">
          <h2 className="dashboard-actions-heading">
            Knowledge objects
            {!loading && (
              <span className="dashboard-result-count" aria-live="polite">
                {objects.length === 0
                  ? ' — No results'
                  : totalCount != null
                    ? ` — ${totalCount} object${totalCount !== 1 ? 's' : ''}${totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}`
                    : totalPages > 1
                      ? ` — Page ${page} of ${totalPages}`
                      : ` — ${objects.length} object${objects.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </h2>
          <div className="dashboard-actions-right">
            {viewMode === 'table' && (
              <div className="density-toggle" role="group" aria-label="Table density">
                <button type="button" className={`btn btn-secondary btn-small ${listDensity === 'compact' ? 'active' : ''}`} onClick={() => setListDensity('compact')} aria-pressed={listDensity === 'compact'}>Compact</button>
                <button type="button" className={`btn btn-secondary btn-small ${listDensity === 'comfortable' ? 'active' : ''}`} onClick={() => setListDensity('comfortable')} aria-pressed={listDensity === 'comfortable'}>Comfy</button>
              </div>
            )}
            <button type="button" className="btn btn-secondary btn-small" onClick={() => { setShowExportModal(true); setExportScope(selectedIds.size > 0 ? 'selected' : 'filtered'); }}>
              Export
            </button>
          </div>
        </section>

        <CommandBar
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onOpenFilters={() => setShowFilters((s) => !s)}
          onOpenCommandPalette={() => {
            previousFocusRef.current = document.activeElement;
            setShowCommandPalette(true);
            setCommandPaletteQuery('');
            setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
          }}
          onToggleQuickAdd={() => setShowQuickAdd((v) => !v)}
          showFilters={showFilters}
        />

        <ActiveFiltersStrip
          chips={filterChips}
          onClearAll={clearFilters}
          onAddFilter={() => setShowFilters(true)}
        />

        <div className="dashboard-toolbar-extras">
          <button
            type="button"
            className={`quick-filter-pill dashboard-activity-toggle${showActivityPanel ? ' active' : ''}`}
            onClick={() => setShowActivityPanel((v) => !v)}
            aria-expanded={showActivityPanel}
          >
            Activity
          </button>
          <div className="dashboard-filter-presets" aria-label="Filter presets">
            <button
              type="button"
              className={`quick-filter-pill ${dueFrom && dueTo ? 'active' : ''}`}
              onClick={() => {
                const today = new Date();
                const in7 = new Date(today);
                in7.setDate(in7.getDate() + 7);
                const dueFromVal = today.toISOString().slice(0, 10);
                const dueToVal = in7.toISOString().slice(0, 10);
                setDueFrom(dueFromVal);
                setDueTo(dueToVal);
                setDateFrom('');
                setDateTo('');
                runSearch(0, null, { dueFrom: dueFromVal, dueTo: dueToVal, dateFrom: '', dateTo: '' });
                setShowFilters(true);
              }}
            >
              Due soon
            </button>
            <button
              type="button"
              className={`quick-filter-pill ${dateFrom && dateTo && !dueFrom && !dueTo ? 'active' : ''}`}
              onClick={() => {
                const today = new Date();
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                const dateFromVal = weekAgo.toISOString().slice(0, 10);
                const dateToVal = today.toISOString().slice(0, 10);
                setDateFrom(dateFromVal);
                setDateTo(dateToVal);
                setDueFrom('');
                setDueTo('');
                runSearch(0, null, { dateFrom: dateFromVal, dateTo: dateToVal, dueFrom: '', dueTo: '' });
                setShowFilters(true);
              }}
            >
              Recent (7d)
            </button>
            {hasActiveFilters && (
              <button type="button" className="quick-filter-pill dashboard-filter-preset-clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
            {savedFilters.length > 0 && (
              <div className="dashboard-saved-filters" ref={savedFiltersDropdownRef}>
                <button
                  type="button"
                  className="quick-filter-pill"
                  onClick={() => setShowSavedFiltersDropdown((v) => !v)}
                  aria-expanded={showSavedFiltersDropdown}
                  aria-haspopup="true"
                >
                  Saved ({savedFilters.length})
                </button>
                {showSavedFiltersDropdown && (
                  <div className="dashboard-saved-filters-dropdown" role="menu">
                    {savedFilters.map((s) => (
                      <div key={s.id} className="dashboard-saved-filters-item">
                        <button type="button" className="dashboard-saved-filters-apply" role="menuitem" onClick={() => applySavedFilter(s)}>
                          {s.name}
                        </button>
                        <button type="button" className="dashboard-saved-filters-delete" aria-label={`Delete ${s.name}`} onClick={() => deleteSavedFilter(s.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="quick-filter-pill" onClick={() => { setSaveFilterName(''); setShowSaveFilterModal(true); }}>
              Save current
            </button>
          </div>

          {showSaveFilterModal && (
            <div className="dashboard-save-filter-inline">
              <input
                type="text"
                className="dashboard-save-filter-input"
                value={saveFilterName}
                onChange={(e) => setSaveFilterName(e.target.value)}
                placeholder="Name this view"
                aria-label="Name for saved filters"
                onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentFilters(); if (e.key === 'Escape') setShowSaveFilterModal(false); }}
              />
              <button type="button" className="btn btn-primary btn-small" onClick={saveCurrentFilters}>Save</button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => { setShowSaveFilterModal(false); setSaveFilterName(''); }}>Cancel</button>
            </div>
          )}

          {domains.length > 0 && (
            <nav className="dashboard-quick-filters" aria-label="Filter by domain">
              <button
                type="button"
                className={`quick-filter-pill ${!domainFilter ? 'active' : ''}`}
                onClick={() => { setDomainFilter(''); runSearch(0, null, { domainFilter: '' }); }}
              >
                All
              </button>
              {domains.slice(0, 8).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`quick-filter-pill ${domainFilter === d.id ? 'active' : ''}`}
                  onClick={() => { setDomainFilter(d.id); runSearch(0, null, { domainFilter: d.id }); }}
                >
                  {d.name}
                </button>
              ))}
            </nav>
          )}
        </div>

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
            onCreateDomain={createDomainInline}
            onCreateTag={createTagInline}
            onApply={() => runSearch(0, null, {
              searchQuery,
              typeFilter,
              statusFilter,
              domainFilter,
              tagFilter,
              dateFrom,
              dateTo,
              dueFrom,
              dueTo,
            })}
            onClear={clearFilters}
          />
        )}

        {!showQuickAdd ? (
          <button
            type="button"
            className="dashboard-quick-add-trigger"
            onClick={() => { setShowQuickAdd(true); setTimeout(() => quickAddInputRef.current?.focus(), 0); }}
            aria-label="Add new object (or press /)"
          >
            <span className="dashboard-quick-add-icon">+</span>
            <span className="dashboard-quick-add-label">Add new object</span>
            <span className="dashboard-quick-add-hint">or press /</span>
          </button>
        ) : (
          <DashboardQuickAddForm
            title={quickAddTitle}
            content={quickAddContent}
            onTitleChange={setQuickAddTitle}
            onContentChange={setQuickAddContent}
            onSubmit={handleQuickAddCreate}
            onCancel={closeQuickAdd}
            saving={quickAddSaving}
            inputRef={quickAddInputRef}
          />
        )}

        {/* FAB on mobile for quick add */}
        {!showQuickAdd && (
          <button
            type="button"
            className="dashboard-fab"
            onClick={() => { setShowQuickAdd(true); setTimeout(() => quickAddInputRef.current?.focus(), 0); }}
            aria-label="Add new object"
          >
            +
          </button>
        )}

        {error && (
          <div className="dashboard-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        {loading ? (
          <SkeletonList lines={8} />
        ) : objects.length === 0 ? (
          hasActiveFilters ? (
            <DashboardEmptyNoResults filterChips={filterChips} onClearAll={clearFilters} />
          ) : (
            <DashboardEmptyFirstRun />
          )
        ) : (
          <>
            {objects.length > 0 && (totalPages > 1 || page > 1) && (
              <DashboardPagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                itemCount={objects.length}
                loading={loading}
                onPageChange={handlePageChange}
              />
            )}
            <div id="dashboard-object-list" ref={listScrollRef} className={`dashboard-object-list-scroll dashboard-density-${listDensity}${viewMode === 'card' ? ' dashboard-object-list-scroll--card' : ''}${viewMode === 'stream' ? ' dashboard-object-list-scroll--stream' : ''}`} style={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }} role="list" aria-label="Knowledge objects" tabIndex={-1}>
              <div style={{ height: `${listVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {listVirtualizer.getVirtualItems().map((virtualRow) => {
                  if (viewMode === 'card') {
                    const rowIndex = virtualRow.index;
                    const startIdx = rowIndex * cardColumns;
                    const rowObjects = objects.slice(startIdx, startIdx + cardColumns);
                    const objectLink = (id) => `/objects/${id}${runPromptTemplate ? `?runPrompt=${runPromptTemplate.id}` : ''}`;
                    return (
                      <div
                        key={`card-row-${rowIndex}`}
                        className="object-card-grid-row-wrap"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div
                          className="object-card-grid-row"
                          style={{ gridTemplateColumns: `repeat(${cardColumns}, minmax(0, 1fr))` }}
                        >
                          {rowObjects.map((rowObj, colIdx) => (
                            <DashboardObjectCard
                              key={rowObj.id}
                              obj={rowObj}
                              to={objectLink(rowObj.id)}
                              selected={selectedIds.has(rowObj.id)}
                              onToggleSelect={toggleSelect}
                              animationDelay={Math.min(startIdx + colIdx, 12) * 25}
                              compact={listDensity === 'compact'}
                              objectIndex={startIdx + colIdx}
                              runPromptSuffix={runPromptSuffix}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  }

                  if (viewMode === 'stream') {
                    const item = streamItems[virtualRow.index];
                    if (!item) return null;
                    return (
                      <div
                        key={item.id}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {item.kind === 'header' ? (
                          <StreamBucketHeader label={item.label} />
                        ) : (
                          <TimelineRow
                            obj={item.obj}
                            to={`/objects/${item.obj.id}${runPromptSuffix}`}
                            selected={selectedIds.has(item.obj.id)}
                            onToggleSelect={toggleSelect}
                            selectionMode={selectionMode}
                            objectIndex={virtualRow.index}
                            navIndex={item.navIndex}
                            snippet={item.obj.snippet || item.obj.summary}
                            runPromptSuffix={runPromptSuffix}
                            listDensity={listDensity}
                          />
                        )}
                      </div>
                    );
                  }

                  const obj = objects[virtualRow.index];
                  return (
                    <div
                      key={obj.id}
                      data-object-index={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <TableViewRow
                        obj={obj}
                        to={`/objects/${obj.id}${runPromptSuffix}`}
                        selected={selectedIds.has(obj.id)}
                        onToggleSelect={toggleSelect}
                        selectionMode={selectionMode}
                        objectIndex={virtualRow.index}
                        compact={listDensity === 'compact'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            {objects.length > 0 && (
              <DashboardPagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                itemCount={objects.length}
                loading={loading}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
          </div>
          <aside className={`dashboard-sidebar${showActivityPanel ? ' dashboard-sidebar--open-mobile' : ''}`} aria-label="Activity">
            <ActivityPulse
              userId={user?.id ?? null}
              heroStats={heroStats}
              dueSoonCount={heroStats?.due_next_7_days ?? 0}
              onTagFilter={handleTagFilterFromActivity}
            />
          </aside>
        </div>
        </LinkedObjectsProvider>

<DashboardCommandPalette
          open={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          query={commandPaletteQuery}
          onQueryChange={setCommandPaletteQuery}
          selectedIndex={commandPaletteSelected}
          onSelectedIndexChange={setCommandPaletteSelected}
          inputRef={commandPaletteInputRef}
          filteredLengthRef={commandPaletteFilteredLengthRef}
          actionsRef={commandPaletteActionsRef}
          objects={objects}
          navigate={navigate}
        />

        <DashboardModals
          showExportModal={showExportModal}
          setShowExportModal={setShowExportModal}
          exportScope={exportScope}
          setExportScope={setExportScope}
          exportFormat={exportFormat}
          setExportFormat={setExportFormat}
          exportTemplate={exportTemplate}
          setExportTemplate={setExportTemplate}
          exporting={exporting}
          handleExportSelected={handleExportSelected}
          selectedIds={selectedIds}
          bulkModal={bulkModal}
          setBulkModal={setBulkModal}
          bulkDomainId={bulkDomainId}
          setBulkDomainId={setBulkDomainId}
          bulkTagId={bulkTagId}
          setBulkTagId={setBulkTagId}
          bulkType={bulkType}
          setBulkType={setBulkType}
          bulkStatus={bulkStatus}
          setBulkStatus={setBulkStatus}
          bulkActionLoading={bulkActionLoading}
          domains={domains}
          tags={tags}
          createDomainInline={createDomainInline}
          createTagInline={createTagInline}
          bulkAddDomain={bulkAddDomain}
          bulkAddTag={bulkAddTag}
          bulkRemoveDomain={bulkRemoveDomain}
          bulkRemoveTag={bulkRemoveTag}
          bulkDelete={bulkDelete}
          bulkChangeType={bulkChangeType}
          bulkSetStatus={bulkSetStatus}
        />
        <BulkActionRibbon
          count={selectedIds.size}
          onClear={clearSelection}
          onSelectAllPage={selectAllOnPage}
          onAddTag={() => { setBulkModal('add_tag'); setBulkTagId(tags[0]?.id ?? ''); }}
          onAddDomain={() => { setBulkModal('add_domain'); setBulkDomainId(domains[0]?.id ?? ''); }}
          onSetStatus={() => { setBulkModal('set_status'); setBulkStatus('active'); }}
          onChangeType={() => { setBulkModal('change_type'); setBulkType('note'); }}
          onExport={() => { setShowExportModal(true); setExportScope('selected'); }}
          onDelete={() => setBulkModal('delete')}
        />
      </div>
    </div>
  
  );
}
