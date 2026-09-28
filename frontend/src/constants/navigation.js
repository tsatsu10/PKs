/**
 * Single source of truth for app navigation: the sidebar and the command palette
 * both read this, so a page can't be reachable from one and missing from the other.
 */
export const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: '⌂', keywords: ['home', 'dashboard'] },
      { to: '/search', label: 'Search', icon: '🔍', keywords: ['search', 'find', 'query'] },
      { to: '/quick', label: 'Quick capture', icon: '⚡', keywords: ['quick', 'capture', 'add'] },
      { to: '/objects/new', label: 'New object', icon: '+', keywords: ['new', 'create', 'object'] },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/paste', label: 'Paste bin', icon: '📋', keywords: ['paste', 'pastebin', 'snippet', 'code'] },
      { to: '/journal', label: 'Journal', icon: '📅', keywords: ['journal', 'calendar', 'diary', 'entry'] },
      { to: '/prompts', label: 'Prompts', icon: '◆', keywords: ['prompts', 'prompt'] },
      { to: '/templates', label: 'Templates', icon: '◇', keywords: ['templates', 'template'] },
      { to: '/notifications', label: 'Notifications', icon: '◉', keywords: ['notifications', 'notify', 'alerts'] },
      { to: '/audit-logs', label: 'Audit logs', icon: '▤', keywords: ['audit', 'logs', 'history'] },
      { to: '/integrations', label: 'Integrations', icon: '◈', keywords: ['integrations', 'webhooks'] },
      { to: '/import', label: 'Import', icon: '↓', keywords: ['import', 'upload', 'csv', 'markdown'] },
      { to: '/trash', label: 'Trash', icon: '🗑', keywords: ['trash', 'deleted', 'restore'] },
      { to: '/settings', label: 'Settings', icon: '⚙', keywords: ['settings', 'preferences'] },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
