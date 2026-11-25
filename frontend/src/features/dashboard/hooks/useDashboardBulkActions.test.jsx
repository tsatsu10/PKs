import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const db = vi.hoisted(() => ({ update: vi.fn(), release: null }));
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (...args) => {
        db.update(...args);
        return { in: () => new Promise((resolve) => { db.release = () => resolve({ error: null }); }) };
      },
    }),
  },
}));
vi.mock('../../../data/objects', () => ({ invalidateObjectLists: vi.fn(async () => {}) }));
vi.mock('../../../lib/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('../../../lib/audit', () => ({ logAudit: vi.fn() }));

import { useDashboardBulkActions } from './useDashboardBulkActions';

const objects = [{ id: 'a', user_id: 'u1' }, { id: 'b', user_id: 'u1' }];

describe('useDashboardBulkActions', () => {
  it('runs a bulk delete once when Confirm is clicked twice before it finishes', async () => {
    const addToast = vi.fn();
    const { result } = renderHook(() =>
      useDashboardBulkActions({ user: { id: 'u1' }, addToast, setError: vi.fn(), objects, appliedRpcPayload: {} }),
    );
    act(() => result.current.selectAllOnPage());

    let first;
    act(() => {
      first = result.current.bulkDelete();
      result.current.bulkDelete();
    });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(result.current.bulkActionLoading).toBe(true);

    await act(async () => {
      db.release();
      await first;
    });
    expect(result.current.bulkActionLoading).toBe(false);
    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith('success', 'Moved 2 to Trash');
  });
});
