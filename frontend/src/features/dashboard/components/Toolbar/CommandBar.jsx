import { Link } from 'react-router-dom';
import { Command, LayoutGrid, List, Plus, Rows3, Search } from 'lucide-react';
import Button from '../../../../components/ui/Button';
import Kbd from '../../../../components/ui/Kbd';
import { modKey } from '../../../../lib/keyboardMap';
import './CommandBar.css';

const VIEW_OPTIONS = [
  { id: 'stream', label: 'Stream', icon: List },
  { id: 'card', label: 'Cards', icon: LayoutGrid },
  { id: 'table', label: 'Table', icon: Rows3 },
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
        <Search size={16} aria-hidden="true" className="command-bar-search-icon" />
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
        <Button type="submit" variant="primary" size="sm">Search</Button>
        <Button size="sm" onClick={onOpenFilters} aria-expanded={showFilters}>Filters</Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenCommandPalette}
          aria-label="Command palette"
          title={`Command palette (${modKey}+K)`}
        >
          <Command size={16} aria-hidden="true" />
          <Kbd keys={['mod', 'K']} />
        </Button>
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
              <opt.icon size={16} aria-hidden="true" />
              <span className="command-bar-view-label">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="command-bar-cta">
          <Button size="sm" onClick={onToggleQuickAdd}>
            <Plus size={16} aria-hidden="true" />
            Quick add
          </Button>
          <Link to="/objects/new" className="ui-button ui-button--primary ui-button--sm">New object</Link>
        </div>
      </div>
    </div>
  );
}
