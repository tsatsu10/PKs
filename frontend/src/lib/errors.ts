import { onlineManager } from '@tanstack/react-query';

export type ErrorKind =
  | 'offline' | 'network' | 'auth' | 'permission' | 'not_found'
  | 'conflict' | 'validation' | 'rate_limited' | 'server' | 'unknown';

export type MessageOverrides = Partial<Record<ErrorKind, string>> & { fallback?: string; message?: string };

const RLS_HINT =
  'Permission denied. Sign out and sign in again. If you just registered, confirm your email first.';

export const ERROR_MESSAGES: Record<Exclude<ErrorKind, 'unknown'>, string> = {
  offline: "You're offline. This will work again once you're back online.",
  network: "Couldn't reach the server. Check your connection and try again.",
  auth: 'Your session expired. Sign in again.',
  permission: RLS_HINT,
  not_found: "That item doesn't exist or was deleted.",
  conflict: 'That name is already taken.',
  validation: "Some of that input isn't valid. Check it and try again.",
  rate_limited: 'Too many requests. Wait a moment and try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
};

const DEFAULT_FALLBACK = 'Something went wrong';
const NETWORK_TEXT = /Failed to fetch|Load failed|NetworkError when attempting to fetch resource|Failed to send a request to the Edge Function/i;
const SERVER_CODES = /^(PGRST0\d\d|57014|53\d{3}|08\d{3}|XX\d{3})$/;

type ErrorLike = { message?: unknown; code?: unknown; status?: unknown; name?: unknown; context?: unknown };

function fields(err: unknown): { message: string; code: string; status: number | null } {
  if (typeof err === 'string') return { message: err, code: '', status: null };
  if (err == null || typeof err !== 'object') return { message: '', code: '', status: null };
  const e = err as ErrorLike;
  const ctx = e.context as { status?: unknown } | undefined;
  const status = typeof e.status === 'number' ? e.status
    : ctx && typeof ctx.status === 'number' ? ctx.status : null;
  return { message: typeof e.message === 'string' ? e.message : '', code: typeof e.code === 'string' ? e.code : '', status };
}

export function classifyError(err: unknown): ErrorKind {
  const { message, code, status } = fields(err);
  if (NETWORK_TEXT.test(message) || (err as ErrorLike | null)?.name === 'FunctionsFetchError') {
    return onlineManager.isOnline() ? 'network' : 'offline';
  }
  if (code === 'PGRST301' || code === 'PGRST302' || status === 401 || /JWT expired/i.test(message)) return 'auth';
  if (code === '42501' || status === 403 || /row-level security/i.test(message)) return 'permission';
  if (code === 'PGRST116' || status === 404) return 'not_found';
  if (code === '23505' || status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (SERVER_CODES.test(code) || (status !== null && status >= 500)) return 'server';
  if (/^22/.test(code) || code === '23502' || code === '23503' || code === '23514' || code === 'P0001'
    || /^PGRST[12]\d\d$/.test(code) || status === 400 || status === 422) return 'validation';
  return 'unknown';
}

/** Messages written for people: strings, plain `Error`s thrown by app code, and SQL `RAISE EXCEPTION` text. */
export function isAppMessage(err: unknown): boolean {
  if (typeof err === 'string') return true;
  if (err instanceof Error) return err.constructor === Error;
  return fields(err).code === 'P0001';
}

export function getErrorMessage(err: unknown, fallbackOrOverrides?: string | MessageOverrides): string {
  const o: MessageOverrides = typeof fallbackOrOverrides === 'string'
    ? { fallback: fallbackOrOverrides }
    : fallbackOrOverrides ?? {};
  const fallback = o.fallback || DEFAULT_FALLBACK;
  if (o.message) return o.message;
  if (err == null || err === '') return fallback;
  const kind = classifyError(err);
  if (o[kind]) return o[kind] as string;
  if (kind !== 'permission' && isAppMessage(err)) {
    const { message } = fields(err);
    if (message) return message;
  }
  return kind === 'unknown' ? fallback : ERROR_MESSAGES[kind];
}
