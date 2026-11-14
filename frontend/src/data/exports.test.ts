import { describe, it, expect, vi } from 'vitest';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { fetchByIdsChunked, fetchObjectsByIdsForExport, fetchFilteredObjectIds, OBJECT_EXPORT_COLS } from './exports';
import { fetchProfile } from './profile';
import { IN_CHUNK } from './chunk';
import type { SearchPayload } from './keys';

describe('exports', () => {
  it('attaches domains and tags to each object and never selects * or fts', async () => {
    sb.current!.respond = (call) => {
      if (call.table === 'knowledge_objects') return { data: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], error: null };
      if (call.table === 'knowledge_object_domains') return { data: [{ knowledge_object_id: 'a', domains: { id: 'd', name: 'Work' } }], error: null };
      return { data: [{ knowledge_object_id: 'b', tags: { id: 't', name: 'ai' } }, { knowledge_object_id: 'b', tags: null }], error: null };
    };
    const objs = await fetchObjectsByIdsForExport(['a', 'b']);
    expect(objs).toEqual([
      { id: 'a', title: 'A', domains: [{ id: 'd', name: 'Work' }], tags: [] },
      { id: 'b', title: 'B', domains: [], tags: [{ id: 't', name: 'ai' }] },
    ]);
    expect(OBJECT_EXPORT_COLS).not.toMatch(/\*|fts/);
  });

  it('collects filtered ids with the same RPC choice and paging as before', async () => {
    const payload = { search_query: 'rust' } as SearchPayload;
    sb.current!.rpc.mockImplementation((_n: string, args?: unknown) => {
      const { offset_n } = args as { offset_n: number };
      return Promise.resolve({ data: Array.from({ length: offset_n === 0 ? 100 : 3 }, (_, i) => ({ id: `${offset_n + i}` })), error: null });
    });
    const ids = await fetchFilteredObjectIds(payload);
    expect(ids).toHaveLength(103);
    expect(sb.current!.rpc.mock.calls.every(([n]) => n === 'search_knowledge_objects_with_snippets')).toBe(true);
  });

  it('splits large id lists so the URL never gets too long', async () => {
    const ids = Array.from({ length: IN_CHUNK * 2 + 7 }, (_, i) => `id${i}`);
    sb.current!.respond = (call) => ({ data: (call.ops.find(([m]) => m === 'in')![1][1] as string[]).map((id) => ({ id })), error: null });
    const callsBefore = sb.current!.calls.length;
    const rows = await fetchByIdsChunked<{ id: string }>('knowledge_object_tags', 'knowledge_object_id, tag_id, tags(id, name)', 'knowledge_object_id', ids);
    expect(rows).toHaveLength(ids.length);
    const inCalls = sb.current!.calls.slice(callsBefore).filter((c) => c.table === 'knowledge_object_tags');
    expect(inCalls).toHaveLength(3);
    expect(inCalls.every((c) => (c.ops.find(([m]) => m === 'in')![1][1] as string[]).length <= IN_CHUNK)).toBe(true);
  });

  it('a failed chunk fails the whole export instead of silently dropping rows', async () => {
    sb.current!.respond = () => ({ data: null, error: { code: 'PGRST000', message: 'down' } });
    await expect(fetchByIdsChunked('tags', 'id', 'id', ['a'])).rejects.toMatchObject({ code: 'PGRST000' });
  });

  it('profile is null when the row is missing', async () => {
    sb.current!.respond = () => ({ data: null, error: null });
    expect(await fetchProfile('u1')).toBeNull();
  });
});
