import { Link } from 'react-router-dom';
import './CommandBar.css';

const VIEW_OPTIONS = [
  { id: 'stream', label: 'Stream', short: '≡' },
  { id: 'card', label: 'Cards', short: '▦' },
  { id: 'table', label: 'Table', short: '☷' },
];

/**
 * Unified command bar: search, view modes, quick actions.
 */
export default function CommandBar({
  searchInputRef,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  viewMode,
  onViewModeChange,
  onOpenFilters,
  onOpenCommandPalette,
  onToggleQuickAdd,
  showFilters,
}) {
  return (
    <div className="command-bar" role="search">
      <form className="command-bar-form" onSubmit={onSearchSubmit}>
        <span className="command-bar-search-icon" aria-hidden="true">⌕</span>
        <input
          ref={searchInputRef}
          type="search"
          className="command-bar-input"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => {
            if (searchQuery.startsWith('/') || searchQuery.startsWith('>')) {
              onOpenCommandPalette?.();
            }
          }}
          placeholder="Search or type / for commands…"
          aria-label="Search knowledge objects"
        />
        <button type="submit" className="btn btn-primary btn-small command-bar-search-btn">
          Search
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={onOpenFilters}
          aria-expanded={showFilters}
        >
          Filters
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small command-bar-kbd"
          onClick={onOpenCommandPalette}
          title="Command palette (Ctrl+K)"
        >
          ⌘K
        </button>
      </form>

      <div className="command-bar-actions">
        <div className="command-bar-view" role="radiogroup" aria-label="View mode">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`command-bar-view-btn${viewMode === opt.id ? ' is-active' : ''}`}
              onClick={() => onViewModeChange(opt.id)}
              aria-pressed={viewMode === opt.id}
              title={opt.label}
            >
              <span className="command-bar-view-icon" aria-hidden="true">{opt.short}</span>
              <span className="command-bar-view-label">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="command-bar-cta">
          <button type="button" className="btn btn-secondary btn-small" onClick={onToggleQuickAdd}>
            + Quick add
          </button>
          <Link to="/objects/new" className="btn btn-primary btn-small">
            New object
          </Link>
        </div>
      </div>
    </div>
  );
}
