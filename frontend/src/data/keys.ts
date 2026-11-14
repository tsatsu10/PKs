/** Arguments of search_knowledge_objects / count_knowledge_objects (built by useDashboardSearch's buildRpcPayload). */
export type SearchPayload = {
  search_query: string | null;
  type_filter: string | null;
  domain_id_f: string | null;
  tag_id_f: string | null;
  date_from_f: string | null;
  date_to_f: string | null;
  status_filter: string | null;
  due_from_f: string | null;
  due_to_f: string | null;
};

/** The only place query keys are built. Roots in persistence.PERSISTED_ROOTS are saved to IndexedDB. */
export const qk = {
  objects: {
    all: ['objects'] as const,
    page: (p: SearchPayload, offset: number) => ['objects', 'page', p, offset] as const,
    count: (p: SearchPayload) => ['objects', 'count', p] as const,
    resume: () => ['objects', 'resume'] as const,
    trailheads: () => ['objects', 'trailheads'] as const,
    linkCandidates: (excludeId: string) => ['objects', 'linkCandidates', excludeId] as const,
  },
  object: {
    all: (id: string) => ['object', id] as const,
    detail: (id: string) => ['object', id, 'detail'] as const,
    domains: (id: string) => ['object', id, 'domains'] as const,
    tags: (id: string) => ['object', id, 'tags'] as const,
    links: (id: string) => ['object', id, 'links'] as const,
    files: (id: string) => ['object', id, 'files'] as const,
    versions: (id: string) => ['object', id, 'versions'] as const,
    runs: (id: string) => ['object', id, 'runs'] as const,
    myShare: (id: string) => ['object', id, 'myShare'] as const,
    shares: (id: string) => ['object', id, 'shares'] as const,
  },
  suggestions: {
    tags: (id: string) => ['suggestions', id, 'tags'] as const,
    links: (id: string) => ['suggestions', id, 'links'] as const,
  },
  search: {
    results: (p: SearchPayload) => ['search', 'results', p] as const,
    linkPicker: (q: string) => ['search', 'linkPicker', q] as const,
  },
  taxonomy: {
    all: ['taxonomy'] as const,
    domains: () => ['taxonomy', 'domains'] as const,
    tags: () => ['taxonomy', 'tags'] as const,
  },
  dashboard: {
    stats: () => ['dashboard', 'stats'] as const,
    activity: () => ['dashboard', 'activity'] as const,
  },
  trash: { list: () => ['trash', 'list'] as const },
  notifications: {
    all: ['notifications'] as const,
    list: (filter: 'all' | 'unread') => ['notifications', 'list', filter] as const,
    recent: () => ['notifications', 'recent'] as const,
    unreadCount: () => ['notifications', 'unreadCount'] as const,
  },
  auditLogs: {
    list: (f: { action: string; dateFrom: string; dateTo: string }) => ['auditLogs', 'list', f] as const,
  },
  pasteBin: {
    all: ['pasteBin'] as const,
    list: () => ['pasteBin', 'list'] as const,
    item: (id: string) => ['pasteBin', 'item', id] as const,
  },
  journal: {
    all: ['journal'] as const,
    month: (start: string, end: string) => ['journal', 'month', start, end] as const,
    day: (date: string) => ['journal', 'day', date] as const,
  },
  prompts: { list: () => ['prompts', 'list'] as const },
  templates: { list: () => ['templates', 'list'] as const },
  integrations: { list: () => ['integrations', 'list'] as const },
  settings: {
    aiProviders: () => ['settings', 'aiProviders'] as const,
    profile: () => ['settings', 'profile'] as const,
  },
} as const;
