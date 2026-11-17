import { useCallback } from 'react';
import { useToast } from '../components/ui/Toaster';
import { getErrorMessage, type MessageOverrides } from './errors';
import { reportError } from './reportError';

/** For failed writes: show a plain-language toast and report the error. Returns the message shown. */
export function useNotifyError(): (err: unknown, overrides?: string | MessageOverrides) => string {
  const { addToast } = useToast() as { addToast: (type: string, message: string) => void };
  return useCallback((err, overrides) => {
    const message = getErrorMessage(err, overrides);
    addToast('error', message);
    reportError(err);
    return message;
  }, [addToast]);
}
