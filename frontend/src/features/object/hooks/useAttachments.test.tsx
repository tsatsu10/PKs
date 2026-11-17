import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { hookWrapper, TEST_OBJECT, holdNext } from '../testUtils';
import { createTestQueryClient } from '../../../test/queryTestUtils';
import { qk } from '../../../data/keys';
import type { FileRow } from '../types';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useAttachments } from './useAttachments';

const FILE: FileRow = { id: 'f1', filename: 'a.pdf', mime_type: 'application/pdf', size_bytes: 10, storage_key: 'owner/f1/a.pdf' };

function setup() {
  const client = createTestQueryClient();
  client.setQueryData(qk.object.files('o1'), [FILE]);
  const setError = vi.fn();
  const r = renderHook(() => useAttachments({ object: TEST_OBJECT, userId: 'owner', setError }), { wrapper: hookWrapper(client) });
  const files = () => (client.getQueryData(qk.object.files('o1')) as FileRow[]).map((f) => f.id);
  return { ...r, setError, files };
}

/** Anchors the download flow clicks, recording whether each was attached to the document at click time. */
function clickSpy() {
  const clicks: { anchor: HTMLAnchorElement; attached: boolean }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
    clicks.push({ anchor: this, attached: document.body.contains(this) });
  });
  return clicks;
}

beforeEach(() => {
  sb.current!.bucket.createSignedUrl.mockReset();
  sb.current!.bucket.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/file' }, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe('useAttachments', () => {
  it('download opens the signed URL in a new tab, clicked while attached', async () => {
    const clicks = clickSpy();
    const { result } = setup();
    await act(() => result.current.download(FILE));
    expect(sb.current!.bucket.createSignedUrl).toHaveBeenCalledWith('owner/f1/a.pdf', 60);
    expect(clicks).toHaveLength(1);
    const { anchor, attached } = clicks[0];
    expect(attached).toBe(true);
    expect(anchor.href).toBe('https://signed.example/file');
    expect(anchor.target).toBe('_blank');
    expect(anchor.rel).toBe('noopener');
    expect(document.body.contains(anchor)).toBe(false);
  });

  it('a failed signed URL opens nothing and reports', async () => {
    const clicks = clickSpy();
    sb.current!.bucket.createSignedUrl.mockResolvedValue({ data: null, error: { code: 'PGRST000', message: 'down' } });
    const { result, setError } = setup();
    await act(() => result.current.download(FILE));
    expect(clicks).toHaveLength(0);
    expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/.+/));
  });

  it('detach hides the file at once and Undo attaches it again', async () => {
    sb.current!.respond = () => ({ data: [], error: null });
    const { result, files } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.detach('f1'); });
    expect(files()).toEqual([]);
    await act(async () => { d.resolve({ data: [], error: null }); await p; });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(files()).toEqual(['f1']));
    const reinsert = sb.current!.calls.filter((c) => c.table === 'knowledge_object_files').at(-1);
    expect(reinsert?.ops).toContainEqual(['insert', [{ knowledge_object_id: 'o1', file_id: 'f1' }]]);
  });

  it('a failed detach brings the file back', async () => {
    sb.current!.respond = () => ({ data: null, error: { code: 'PGRST000', message: 'down' } });
    const { result, files, setError } = setup();
    await act(() => result.current.detach('f1'));
    expect(files()).toEqual(['f1']);
    expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/.+/));
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});
