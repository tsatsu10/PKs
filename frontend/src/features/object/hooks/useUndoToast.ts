import { useCallback } from 'react';
import { useToast, UNDO_TTL_MS } from '../../../context/ToastContext';
import { useNotifyError } from '../../../lib/useNotifyError';

type ToastApi = {
  addToast: (type: string, message: string, opts?: { action?: { label: string; onClick: () => void }; ttlMs?: number }) => string;
  dismiss: (id: string) => void;
};

/**
 * U5: a success toast with Undo for UNDO_TTL_MS. Returns `withdraw`, which removes the toast
 * (call it when the action itself failed, so there is nothing to undo).
 */
export function useUndoToast() {
  const { addToast, dismiss } = useToast() as ToastApi;
  const notifyError = useNotifyError();
  return useCallback((message: string, undo: () => Promise<unknown>) => {
    const id = addToast('success', message, {
      ttlMs: UNDO_TTL_MS,
      action: { label: 'Undo', onClick: () => { undo().catch((err) => notifyError(err, 'Undo failed')); } },
    });
    return () => dismiss(id);
  }, [addToast, dismiss, notifyError]);
}
