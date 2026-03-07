import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './MainMenuDeck.css';

const DECK_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '⌂' },
  { to: '/search', label: 'Search', icon: '🔍' },
  { to: '/objects/new', label: 'New object', icon: '+' },
  { to: '/paste', label: 'Paste bin', icon: '📋' },
  { to: '/quick', label: 'Quick capture', icon: '⚡' },
  { to: '/journal', label: 'Journal', icon: '📅' },
  { to: '/prompts', label: 'Prompts', icon: '◆' },
  { to: '/templates', label: 'Templates', icon: '◇' },
  { to: '/notifications', label: 'Notifications', icon: '◉' },
  { to: '/audit-logs', label: 'Audit logs', icon: '▤' },
  { to: '/integrations', label: 'Integrations', icon: '◈' },
  { to: '/import', label: 'Import', icon: '↓' },
  { to: '/about', label: 'About', icon: 'ℹ' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

const WHEEL_RADIUS = 140;
const WHEEL_ITEM_COUNT = DECK_ITEMS.length;

function getWheelPosition(index) {
  const angleDeg = -90 + (180 * index) / Math.max(1, WHEEL_ITEM_COUNT - 1);
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: WHEEL_RADIUS * Math.sin(angleRad),
    y: -WHEEL_RADIUS * Math.cos(angleRad),
  };
}

export default function MainMenuDeck() {
  const [open, setOpen] = useState(false);
  const wheelRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    queueMicrotask(() => setOpen(false));
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <nav className="main-menu-deck" aria-label="Quick navigation wheel">
      <div
        className={`main-menu-deck-backdrop ${open ? 'main-menu-deck-backdrop-visible' : ''}`}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <div
        ref={wheelRef}
        className={`main-menu-deck-wheel ${open ? 'main-menu-deck-wheel-open' : ''}`}
        role="menu"
        aria-hidden={!open}
      >
        <span className="main-menu-deck-wheel-hint">Go to…</span>
        {DECK_ITEMS.map((item, i) => {
          const { x, y } = getWheelPosition(i);
          const isActive =
            location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`main-menu-deck-wheel-item ${isActive ? 'active' : ''}`}
              style={{ '--wx': `${x}px`, '--wy': `${y}px` }}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span className="main-menu-deck-wheel-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="main-menu-deck-wheel-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="main-menu-deck-trigger-wrap">
        <button
          type="button"
          className="main-menu-deck-trigger"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-haspopup="menu"
        >
          <span className="main-menu-deck-trigger-icon" aria-hidden>
            {open ? '✕' : '☰'}
          </span>
        </button>
        <span className="main-menu-deck-trigger-label" aria-hidden>
          {open ? 'Close' : 'Menu'}
        </span>
      </div>
    </nav>
  );
}
