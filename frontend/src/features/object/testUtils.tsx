import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createTestQueryClient } from '../../test/queryTestUtils';
import { ToastProvider } from '../../context/ToastContext';
import type { ObjectRow } from './types';

/** Query client + toasts + router, for rendering the object page's hooks and components in tests. */
export function hookWrapper() {
  const client = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter>{children}</MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
  };
}

export const TEST_OBJECT: ObjectRow = {
  id: 'o1', user_id: 'owner', type: 'note', title: 'First', content: 'body', source: null, summary: 'S', key_points: [],
  is_deleted: false, revision: 3, current_version: 2, status: 'active', slug: 'first', cover_url: null, due_at: null,
  remind_at: null, updated_at: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', is_pinned: false,
};
