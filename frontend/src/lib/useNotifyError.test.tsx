import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const addToast = vi.fn();
vi.mock('../components/ui/Toaster', () => ({ useToast: () => ({ addToast }) }));
const reportError = vi.fn();
vi.mock('./reportError', () => ({ reportError: (e: unknown) => reportError(e) }));

import { useNotifyError } from './useNotifyError';

describe('useNotifyError', () => {
  it('toasts the plain message and reports the error', () => {
    const { result } = renderHook(() => useNotifyError());
    const err = { code: 'PGRST000', message: 'connection refused' };
    result.current(err, 'Failed to save');
    expect(addToast).toHaveBeenCalledWith('error', 'Something went wrong on our side. Try again in a moment.');
    expect(reportError).toHaveBeenCalledWith(err);
  });
});
