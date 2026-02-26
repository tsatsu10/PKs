import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFocusTrap } from '@mantine/hooks';
import './CommandPalette.css';

const QUICK_ACTIONS = [
  { label: 'Go to Dashboard', path: '/', keywords: ['home', 'dashboard'] },
  { label: 'Search objects', path: '/search', keywords: ['search', 'find', 'query'] },
  { label: 'Quick capture', path: '/quick', keywords: ['quick', 'capture', 'add'] },
  { label: 'New object', path: '/objects/new', keywords: ['new', 'create', 'object'] },
  { label: 'Paste bin', path: '/paste', keywords: ['paste', 'pastebin', 'snippet', 'code'] },
  { label: 'Journal', path: '/journal', keywords: ['journal', 'calendar', 'diary', 'entry'] },
  { label: 'Prompts', path: '/prompts', keywords: ['prompts', 'prompt'] },
  { label: 'Templates', path: '/templates', keywords: ['templates', 'template'] },
  { label: 'Notifications', path: '/notifications', keywords: ['notifications', 'notify'] },
  { label: 'Audit logs', path: '/audit-logs', keywords: ['audit', 'logs', 'history'] },
  { label: 'Integrations', path: '/integrations', keywords: ['integrations', 'integrate'] },
  { label: 'Import', path: '/import', keywords: ['import', 'upload', 'csv', 'markdown'] },
  { label: 'About PKS', path: '/about', keywords: ['about', 'help', 'pks', 'project'] },
  { label: 'Trash', path: '/trash', keywords: ['trash', 'deleted', 'restore'] },
  { label: 'Settings', path: '/settings', keywords: ['settings', 'preferences'] },
];

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const prevFocusRef = useRef(/** @type {HTMLElement | null} */ (null));
  const focusTrapRef = useFocusTrap(open);
  const navigate = useNavigate();

  const searchOnDashboard = query.trim();
  const filteredActions = searchOnDashboard
    ? QUICK_ACTIONS.filter(
        (a) =>
          a.label.toLowerCase().includes(searchOnDashboard.toLowerCase()) ||
          a.keywords.some((k) => k.includes(searchOnDashboard.toLowerCase()))
      )
    : QUICK_ACTIONS;

  const items = useMemo(() => {
    const searchItems = searchOnDashboard
      ? [
          { label: `Search objects for "${searchOnDashboard.slice(0, 28)}${searchOnDashboard.length > 28 ? '…' : ''}"`, path: `/search?q=${encodeURIComponent(searchOnDashboard)}`, isSearch: true },
          { label: `Search on Dashboard for "${searchOnDashboard.slice(0, 28)}${searchOnDashboard.length > 28 ? '…' : ''}"`, path: `/?q=${encodeURIComponent(searchOnDashboard)}`, isSearch: true },
        ]
      : [];
    return [...searchItems, ...filteredActions];
  }, [searchOnDashboard, filteredActions]);
  const maxIndex = items.length - 1;

  /* Save focus when opening; restore when closing */
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else {
      const prev = prevFocusRef.current;
      prevFocusRef.current = null;
      if (prev && typeof prev.focus === 'function') prev.focus();
    }
  }, [open]);

  /* Reset when palette opens; clamp highlight to list length (intentional setState in effect) */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setHighlight((h) => (h > maxIndex ? maxIndex : h < 0 ? 0 : h));
  }, [maxIndex]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    function handleKeyDown(e) {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h >= maxIndex ? 0 : h + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h <= 0 ? maxIndex : h - 1));
        return;
      }
      if (e.key === 'Enter' && items[highlight]) {
        e.preventDefault();
        navigate(items[highlight].path);
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, highlight, maxIndex, items, navigate]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.querySelector(`[data-index="${highlight}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, highlight]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div ref={focusTrapRef} className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-input-wrap">
          <span className="command-palette-icon" aria-hidden>⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Search or run a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Command search"
          />
        </div>
        <ul ref={listRef} className="command-palette-list" role="listbox">
          {items.map((item, i) => (
            <li
              key={item.path + (item.isSearch ? '-search' : '')}
              role="option"
              aria-selected={i === highlight}
              data-index={i}
              className={`command-palette-item ${i === highlight ? 'highlight' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                navigate(item.path);
                onClose();
              }}
            >
              {item.isSearch && <span className="command-palette-item-icon">🔍</span>}
              {item.label}
            </li>
          ))}
        </ul>
        <p className="command-palette-hint">↑↓ navigate · Enter select · Esc close</p>
      </div>
    </div>
  );
}
