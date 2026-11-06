import { vi } from 'vitest';

type Result = { data: unknown; error: unknown; count?: number | null };
type Call = { table: string; ops: Array<[string, unknown[]]> };

/**
 * A chainable fake of supabase.from()/rpc(). Every builder method records itself and returns the
 * chain; awaiting the chain (or calling single/maybeSingle) resolves to `respond(call)`.
 *   const sb = mockSupabase(); vi.mock('../lib/supabase', () => ({ supabase: sb.client }));
 *   sb.respond = (call) => call.table === 'tags' ? { data: [...], error: null } : { data: [], error: null };
 */
export function mockSupabase() {
  const calls: Call[] = [];
  const state = {
    respond: (_call: Call): Result => ({ data: [], error: null }),
    rpc: vi.fn((_name: string, _args?: unknown): Promise<Result> => Promise.resolve({ data: null, error: null })),
  };
  function from(table: string) {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'neq', 'is', 'not', 'in', 'or', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'range', 'insert', 'update', 'upsert', 'delete'];
    for (const m of methods) {
      chain[m] = (...args: unknown[]) => { call.ops.push([m, args]); return chain; };
    }
    chain.single = () => { call.ops.push(['single', []]); return Promise.resolve(state.respond(call)); };
    chain.maybeSingle = () => { call.ops.push(['maybeSingle', []]); return Promise.resolve(state.respond(call)); };
    chain.then = (ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) =>
      Promise.resolve(state.respond(call)).then(ok, fail);
    return chain;
  }
  const client = { from: vi.fn(from), rpc: (name: string, args?: unknown) => state.rpc(name, args) };
  return {
    client,
    calls,
    get respond() { return state.respond; },
    set respond(fn) { state.respond = fn; },
    rpc: state.rpc,
  };
}
