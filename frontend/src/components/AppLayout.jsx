import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useIsMobile } from '../breakpoints';
import NotificationCenter from './NotificationCenter';
import CommandPalette from './CommandPalette';
import ShortcutsModal from './ShortcutsModal';
import './AppLayout.css';

const SIDEBAR_COLLAPSED_KEY = 'pks-sidebar-collapsed';

const navGroups = [
  {
    label: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: '⌂' },
      { to: '/quick', label: 'Quick capture', icon: '⚡' },
      { to: '/objects/new', label: 'New object', icon: '+' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/paste', label: 'Paste bin', icon: '📋' },
      { to: '/journal', label: 'Journal', icon: '📅' },
      { to: '/prompts', label: 'Prompts', icon: '◆' },
      { to: '/templates', label: 'Templates', icon: '◇' },
      { to: '/notifications', label: 'Notifications', icon: '◉' },
      { to: '/audit-logs', label: 'Audit logs', icon: '▤' },
      { to: '/integrations', label: 'Integrations', icon: '◈' },
      { to: '/settings', label: 'Settings', icon: '⚙' },
    ],
  },
];

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const { resolvedTheme, cycleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        navigate('/objects/new');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        navigate('/quick');
        return;
      }
      if (e.key === '?' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) ?? 'false');
    } catch {
      return false;
    }
  });

  const isMobile = useIsMobile(768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch (_e) { void _e; }
  }, [collapsed]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className={`app-layout ${collapsed ? 'app-layout-sidebar-collapsed' : ''} ${mobileMenuOpen ? 'app-layout-sidebar-open' : ''}`}>
      <aside className="app-layout-sidebar" aria-label="Main navigation" aria-hidden={isMobile && !mobileMenuOpen}>
        <div className="app-layout-sidebar-top">
          <button
            type="button"
            className="app-layout-sidebar-close"
            aria-label="Close menu"
            onClick={closeMobileMenu}
          >
            ✕
          </button>
          <Link to="/" className="app-layout-brand" title="Personal Knowledge System">
            <img src="/pks-logo.svg" alt="" className="app-layout-logo" width="32" height="32" />
            {!collapsed && (
              <span className="app-layout-brand-words">
                <span className="app-layout-brand-mark" aria-hidden>PKS</span>
                <span className="app-layout-brand-text">
                  <span className="app-layout-tagline">Your second brain</span>
                  <span className="app-layout-full-name">Personal Knowledge System</span>
                </span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              className="app-layout-command-hint"
              onClick={() => setCommandOpen(true)}
              title="Open command palette (Ctrl+K)"
            >
              <span className="app-layout-command-kbd">⌘K</span>
              <span>Search or jump…</span>
            </button>
          )}
        </div>
        <nav className="app-layout-nav" aria-label="Primary">
          {navGroups.map(({ label: groupLabel, items }) => (
            <div key={groupLabel} className="app-layout-nav-group">
              {!collapsed && (
                <span className="app-layout-nav-group-label" aria-hidden>
                  {groupLabel}
                </span>
              )}
              <ul className="app-layout-nav-list" role="list">
                {items.map(({ to, label, icon }) => {
                  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
                  return (
                    <li key={to}>
                      <Link
                        to={to}
                        className={`app-layout-nav-link ${isActive ? 'active' : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                        title={collapsed ? label : undefined}
                        onClick={closeMobileMenu}
                      >
                        <span className="app-layout-nav-icon" aria-hidden>{icon}</span>
                        {!collapsed && <span className="app-layout-nav-label">{label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="app-layout-sidebar-bottom">
          <div className="app-layout-sidebar-actions">
            <button type="button" onClick={cycleTheme} className="app-layout-icon-btn" aria-label={resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'} title={resolvedTheme === 'dark' ? 'Light' : 'Dark'}>
              <span aria-hidden>{resolvedTheme === 'dark' ? '☀' : '☽'}</span>
            </button>
            <NotificationCenter />
            <button type="button" onClick={() => setShortcutsOpen(true)} className="app-layout-icon-btn" aria-label="Keyboard shortcuts" title="Shortcuts (?)">
              <span aria-hidden>?</span>
            </button>
            <button type="button" onClick={() => setCommandOpen(true)} className="app-layout-icon-btn" aria-label="Command palette" title="Command palette (⌘K)">
              <span aria-hidden>⌘</span>
            </button>
          </div>
          <div className="app-layout-sidebar-user">
            {!collapsed && <span className="app-layout-user-email" aria-hidden>{user?.email}</span>}
            <button type="button" onClick={() => { closeMobileMenu(); logout(); }} className="app-layout-logout" aria-label="Sign out" title={collapsed ? 'Sign out' : undefined}>
              <span className="app-layout-nav-icon" aria-hidden>⎋</span>
              {!collapsed && <span className="app-layout-nav-label">Sign out</span>}
            </button>
          </div>
        </div>
        <button
          type="button"
          className="app-layout-sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </aside>
      <div
        className={`app-layout-backdrop ${mobileMenuOpen ? 'app-layout-backdrop-visible' : ''}`}
        aria-hidden="true"
        onClick={closeMobileMenu}
      />
      <main className="app-layout-main" id="main-content" role="main">
        <div className="app-layout-mobile-header">
          <button
            type="button"
            className="app-layout-mobile-menu-btn"
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            ☰
          </button>
        </div>
        {children}
      </main>
      <nav className="app-layout-bottom-nav" aria-label="Mobile navigation">
        <Link to="/" className={`app-layout-bottom-link ${location.pathname === '/' ? 'active' : ''}`} aria-current={location.pathname === '/' ? 'page' : undefined}>
          <span className="app-layout-bottom-icon" aria-hidden>⌂</span>
          <span className="app-layout-bottom-label">Home</span>
        </Link>
        <Link to="/objects/new" className={`app-layout-bottom-link ${location.pathname === '/objects/new' ? 'active' : ''}`} aria-current={location.pathname === '/objects/new' ? 'page' : undefined}>
          <span className="app-layout-bottom-icon" aria-hidden>+</span>
          <span className="app-layout-bottom-label">New</span>
        </Link>
        <Link to="/notifications" className={`app-layout-bottom-link ${location.pathname === '/notifications' ? 'active' : ''}`} aria-current={location.pathname === '/notifications' ? 'page' : undefined}>
          <span className="app-layout-bottom-icon" aria-hidden>◉</span>
          <span className="app-layout-bottom-label">Alerts</span>
        </Link>
        <Link to="/settings" className={`app-layout-bottom-link ${location.pathname === '/settings' ? 'active' : ''}`} aria-current={location.pathname === '/settings' ? 'page' : undefined}>
          <span className="app-layout-bottom-icon" aria-hidden>⚙</span>
          <span className="app-layout-bottom-label">Settings</span>
        </Link>
      </nav>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
