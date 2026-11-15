import { onlineManager } from '@tanstack/react-query';
import { supabase } from './supabase';
import { classifyError, isAppMessage, type ErrorKind } from './errors';

const REPORTED_KINDS = new Set<ErrorKind>(['server', 'unknown', 'permission']);
const DEDUPE_MS = 60_000;
const SESSION_CAP = 20;

const lastSent = new Map<string, number>();
let sentThisSession = 0;

export function resetReporterForTests(): void {
  lastSent.clear();
  sentThisSession = 0;
}

/** Remove personal data: emails, JWTs, `(column)=(value)` fragments, URL query strings and hashes. */
export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jwt]')
    .replace(/\)=\((?:[^()]|\([^()]*\))*\)/g, ')=([value])')
    .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1');
}

function messageOf(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/**
 * Send an unexpected error to the server log. Returns true when it was sent (or already sent
 * within the dedupe window), false when it was skipped (expected kinds, app messages) or
 * couldn't be sent (offline, session cap).
 */
export function reportError(err: unknown): boolean {
  try {
    const kind = classifyError(err);
    if (!REPORTED_KINDS.has(kind)) return false;
    if (kind === 'unknown' && isAppMessage(err)) return false;
    if (!onlineManager.isOnline()) return false;

    const message = scrub(messageOf(err)).slice(0, 500);
    const stack = err instanceof Error && err.stack ? scrub(err.stack).slice(0, 4096) : null;
    const fingerprint = hash(`${kind}|${message}|${stack?.split('\n')[1] ?? ''}`);
    const now = Date.now();
    const previous = lastSent.get(fingerprint);
    if (previous !== undefined && now - previous < DEDUPE_MS) return true;
    if (sentThisSession >= SESSION_CAP) return false;
    lastSent.set(fingerprint, now);
    sentThisSession += 1;

    void Promise.resolve(
      supabase.rpc('report_client_error', {
        p_kind: kind,
        p_message: message,
        p_stack: stack,
        p_route: window.location.pathname,
        p_app_version: __APP_VERSION__,
        p_user_agent: navigator.userAgent.slice(0, 200),
        p_fingerprint: fingerprint,
      }),
    ).catch(() => undefined);
    return true;
  } catch {
    // The reporter must never throw or report itself.
    return false;
  }
}

/** Report errors outside React: uncaught exceptions and unhandled promise rejections. */
export function installGlobalErrorReporting(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => { reportError(event.error ?? event.message); };
  const onRejection = (event: Event) => { reportError((event as PromiseRejectionEvent).reason); };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
