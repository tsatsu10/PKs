import { useCallback } from 'react';
import { useToast, UNDO_TTL_MS } from '../../../components/ui/Toaster';
import { useNotifyError } from '../../../lib/useNotifyError';

type ToastApi = {
  addToast: (type: string, message: string, opts?: { action?: { label: string; onClick: () => void }; ttlMs?: number }) => string;
  dismiss: (id: string) => void;
};

/**
 * U5: a success toast with Undo for UNDO_TTL_MS. Returns `withdraw`, which removes the toast
 * (call it when the action itself failed, so there is nothing to undo).
 * `after` is the action's own request: Undo clicked before it settles waits for it, so the two
 * can't land in the wrong order; if it failed, there is nothing to undo.
 */
export function useUndoToast() {
  const { addToast, dismiss } = useToast() as ToastApi;
  const notifyError = useNotifyError();
  return useCallback((message: string, undo: () => Promise<unknown>, after?: Promise<unknown>) => {
    const id = addToast('success', message, {
      ttlMs: UNDO_TTL_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          Promise.resolve(after).then(
            () => undo().catch((err) => notifyError(err, 'Undo failed')),
            () => undefined,
          );
        },
      },
    });
    return () => dismiss(id);
  }, [addToast, dismiss, notifyError]);
}
