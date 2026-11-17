import type { ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createTestQueryClient } from '../../test/queryTestUtils';
import { ToastProvider } from '../../components/ui/Toaster';
import type { ObjectRow } from './types';

/** Query client + toasts + router, for rendering the object page's hooks and components in tests. */
export function hookWrapper(client: QueryClient = createTestQueryClient()) {
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
  remind_at: null, updated_at: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', is_pinned: false, content_json: null,
};

/** A promise you settle by hand: lets a test look at the cache while a request is still in flight. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

type Responder<C, R> = { respond: (call: C) => R };
/** Make the mock's next from() call resolve only when the test calls resolve(result). */
export function holdNext<C, R>(mock: Responder<C, R>) {
  const d = deferred<R>();
  const prev = mock.respond;
  let used = false;
  mock.respond = (call: C) => {
    if (used) return prev(call);
    used = true;
    return d.promise as unknown as R;
  };
  return d;
}
