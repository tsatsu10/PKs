import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { hookWrapper, TEST_OBJECT } from '../testUtils';
import type { FileRow } from '../types';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useAttachments } from './useAttachments';

const FILE: FileRow = { id: 'f1', filename: 'a.pdf', mime_type: 'application/pdf', size_bytes: 10, storage_key: 'owner/f1/a.pdf' };
const BLOCKED = 'Your browser blocked the download window. Allow pop-ups for this site, then try again.';

function setup() {
  const setError = vi.fn();
  const r = renderHook(() => useAttachments({ object: TEST_OBJECT, userId: 'owner', setAttachedFiles: vi.fn(), setError }), { wrapper: hookWrapper() });
  return { ...r, setError };
}

function fakeWindow() {
  return { location: { href: '' }, close: vi.fn(), opener: {} as unknown } as unknown as Window & { close: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  sb.current!.bucket.createSignedUrl.mockReset();
  sb.current!.bucket.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/file' }, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe('useAttachments', () => {
  it('download opens the window before awaiting the signed URL', () => {
    const win = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(win);
    sb.current!.bucket.createSignedUrl.mockReturnValue(new Promise(() => {}));
    const { result } = setup();
    void result.current.download(FILE);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('', '_blank');
  });

  it('download sends the opened window to the signed URL', async () => {
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win);
    const { result } = setup();
    await act(() => result.current.download(FILE));
    expect(sb.current!.bucket.createSignedUrl).toHaveBeenCalledWith('owner/f1/a.pdf', 60);
    expect(win.location.href).toBe('https://signed.example/file');
    expect(win.opener).toBeNull();
  });

  it('download with a blocked popup shows the pop-up message', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result, setError } = setup();
    await act(() => result.current.download(FILE));
    expect(setError).toHaveBeenLastCalledWith(BLOCKED);
    expect(sb.current!.bucket.createSignedUrl).not.toHaveBeenCalled();
  });

  it('a failed signed URL closes the window and reports', async () => {
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win);
    sb.current!.bucket.createSignedUrl.mockResolvedValue({ data: null, error: { code: 'PGRST000', message: 'down' } });
    const { result, setError } = setup();
    await act(() => result.current.download(FILE));
    expect(win.close).toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/.+/));
  });
});
