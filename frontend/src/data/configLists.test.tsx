import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { usePromptsList } from './prompts';
import { useTemplatesList } from './templates';
import { useJournalDay } from './journal';

describe('config lists', () => {
  it('prompts load past 1,000 rows and never select *', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: `p${i}`, name: `n${i}` }));
    sb.current!.respond = (call) => {
      const range = call.ops.find(([m]) => m === 'range')?.[1] as [number, number];
      return { data: rows.slice(range[0], range[1] + 1), error: null };
    };
    const { result } = renderHook(() => usePromptsList('u1'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.data).toHaveLength(1500));
    const selects = sb.current!.calls.flatMap((c) => c.ops.filter(([m]) => m === 'select').map(([, a]) => a[0]));
    expect(selects.every((s) => s !== '*' && !String(s).includes('output_format'))).toBe(true);
  });

  it('templates surface an error instead of "No templates yet"', async () => {
    sb.current!.respond = () => ({ data: null, error: { code: 'PGRST000', message: 'down' } });
    const { result } = renderHook(() => useTemplatesList('u1'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it('a journal day is not refetched on focus while it is being edited', async () => {
    sb.current!.respond = () => ({ data: { id: 'j', content: 'x', entry_date: '2026-10-13', updated_at: 't' }, error: null });
    const { result } = renderHook(() => useJournalDay('u1', '2026-10-13'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const before = sb.current!.calls.length;
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await new Promise((r) => setTimeout(r, 20));
    expect(sb.current!.calls.length).toBe(before);
    focusManager.setFocused(undefined);
  });
});
