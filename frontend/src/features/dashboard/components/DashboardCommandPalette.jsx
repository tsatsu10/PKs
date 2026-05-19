/**
 * Cmd/Ctrl+K command palette overlay.
 */
export default function DashboardCommandPalette({
  open,
  onClose,
  query,
  onQueryChange,
  selectedIndex,
  onSelectedIndexChange,
  inputRef,
  filteredLengthRef,
  actionsRef,
  objects,
  navigate,
}) {
  if (!open) return null;

  const q = query.trim().toLowerCase();
  const actions = [
    { id: 'new', label: 'New object', run: () => { onClose(); navigate('/objects/new'); } },
    { id: 'quick', label: 'Quick capture', run: () => { onClose(); navigate('/quick'); } },
    { id: 'due', label: 'Due soon', run: () => { onClose(); navigate('/?due=soon'); } },
    { id: 'settings', label: 'Settings', run: () => { onClose(); navigate('/settings'); } },
    ...objects.slice(0, 5).map((o) => ({
      id: o.id,
      label: o.title,
      run: () => { onClose(); navigate(`/objects/${o.id}`); },
    })),
  ];
  const filtered = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
  filteredLengthRef.current = filtered.length;
  actionsRef.current = filtered;
  const selected = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  return (
    <div
      className="dashboard-command-palette-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dashboard-command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="dashboard-command-palette-input"
          value={query}
          onChange={(e) => { onQueryChange(e.target.value); onSelectedIndexChange(0); }}
          placeholder="Search or run action…"
          aria-label="Command palette search"
          autoComplete="off"
        />
        <ul className="dashboard-command-palette-list" role="listbox">
          {filtered.map((a, i) => (
            <li key={a.id} role="option" aria-selected={i === selected}>
              <button
                type="button"
                className={`dashboard-command-palette-item ${i === selected ? 'selected' : ''}`}
                onMouseEnter={() => onSelectedIndexChange(i)}
                onClick={() => a.run()}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="dashboard-command-palette-hint">↑↓ navigate · Enter run · Esc close</p>
      </div>
    </div>
  );
}
