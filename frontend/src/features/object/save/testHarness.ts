// Test-only: a fake knowledge_objects row behind mockSupabase, for the save queue tests.
import type { mockSupabase } from '../../../test/supabaseMock';

type Mock = ReturnType<typeof mockSupabase>;
type Result = { data: unknown; error: unknown };
type Call = Mock['calls'][number];
type Row = Record<string, unknown> & { id: string; revision: number; user_id: string; is_deleted: boolean };

const BASE = {
  type: 'note', title: 'T', content: 'body', content_json: null, summary: null, key_points: [], source: null,
  status: 'active', current_version: 1, is_deleted: false, is_pinned: false, updated_at: '2026-11-01T00:00:00Z',
};

const isUpdate = (c: Call) => c.table === 'knowledge_objects' && c.ops.some(([m]) => m === 'update');

export function saveHarness(get: () => Mock) {
  let row: Row | null = null;
  let held: Promise<void> | null = null;
  let scripted: Array<Result | ((call: Call) => Result)> = [];
  let shareRole: string | null = null;

  function applyUpdate(call: Call): Result {
    const next = scripted.shift();
    if (next) return typeof next === 'function' ? next(call) : next;
    if (!row) return { data: [], error: null };
    const rev = call.ops.find(([m, a]) => m === 'eq' && a[0] === 'revision')?.[1][1];
    if (rev !== row.revision) return { data: [], error: null };
    row = { ...row, ...(call.ops.find(([m]) => m === 'update')![1][0] as object), revision: row.revision + 1 };
    return { data: [row], error: null };
  }

  function respond(call: Call): Result {
    if (isUpdate(call)) {
      if (held) return held.then(() => applyUpdate(call)) as unknown as Result;
      return applyUpdate(call);
    }
    if (call.table === 'knowledge_objects') return { data: row, error: null };
    if (call.table === 'share_permissions') return { data: shareRole ? { role: shareRole } : null, error: null };
    return { data: [], error: null };
  }

  const updates = () => get().calls.filter(isUpdate);
  return {
    reset(over: Partial<Row> & { id: string }) {
      row = { ...BASE, user_id: 'u1', revision: 1, ...over } as Row;
      held = null;
      scripted = [];
      shareRole = null;
      get().calls.length = 0;
      get().rpc.mockReset();
      get().rpc.mockImplementation(() => Promise.resolve({ data: 1, error: null }));
      get().auth.refreshSession.mockClear();
      get().respond = respond;
    },
    /** The server-side row (null: deleted or hidden by RLS). */
    get row() { return row; },
    set row(next: Row | null) { row = next; },
    setShareRole(role: string | null) { shareRole = role; },
    /** Hold every update until the returned release() is called. */
    hold(): () => void {
      let release = () => {};
      held = new Promise<void>((r) => { release = () => { held = null; r(); }; });
      return release;
    },
    /** Responses for the next updates, in order (then back to the fake row). */
    script(...results: Array<Result | ((call: Call) => Result)>) { scripted.push(...results); },
    updates,
    patch: (i: number) => updates()[i].ops.find(([m]) => m === 'update')![1][0] as Record<string, unknown>,
    revision: (i: number) => updates()[i].ops.find(([m, a]) => m === 'eq' && a[0] === 'revision')?.[1][1],
  };
}
