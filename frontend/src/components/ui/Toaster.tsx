/* eslint-disable react-refresh/only-export-components -- context exports provider + hook */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import IconButton from './IconButton';
import './Toaster.css';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** Lifetime in ms; null keeps the toast until dismissed. Errors default to null. */
  ttlMs?: number | null;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
  ttlMs: number | null;
}

export interface ToastApi {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, opts?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const TOAST_TTL_MS = 4000;
/** How long an Undo toast stays (U5). */
export const UNDO_TTL_MS = 6000;
const MAX_VISIBLE = 4;

const ToastCtx = createContext<ToastApi | null>(null);

interface Timer {
  timer: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** Mirror of `toasts` for synchronous reads inside addToast (dedupe, cap). */
  const list = useRef<Toast[]>([]);
  /** id -> timer. A paused toast has `timer: null`; a sticky toast has no entry. */
  const timers = useRef(new Map<string, Timer>());

  const commit = useCallback((next: Toast[]) => {
    list.current = next;
    setToasts(next);
  }, []);

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t?.timer) clearTimeout(t.timer);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback((id: string) => {
    clearTimer(id);
    commit(list.current.filter((toast) => toast.id !== id));
  }, [clearTimer, commit]);

  const start = useCallback((id: string, ms: number) => {
    timers.current.set(id, { timer: setTimeout(() => dismiss(id), ms), remaining: ms, startedAt: Date.now() });
  }, [dismiss]);

  const addToast = useCallback((type: ToastType, message: string, opts: ToastOptions = {}) => {
    const ttlMs = opts.ttlMs !== undefined ? opts.ttlMs : type === 'error' ? null : TOAST_TTL_MS;

    // Toasts with an action (Undo) are never merged: each one undoes a different thing.
    const existing = opts.action
      ? undefined
      : list.current.find((t) => !t.action && t.type === type && t.message === message);
    if (existing) {
      clearTimer(existing.id);
      if (existing.ttlMs !== null) start(existing.id, existing.ttlMs);
      return existing.id;
    }

    const id = Math.random().toString(36).slice(2);
    let next = list.current;
    if (next.length >= MAX_VISIBLE) {
      // Make room among the toasts already showing, so the newcomer is always seen.
      const drop = next.find((t) => t.type !== 'error') ?? next[0];
      clearTimer(drop.id);
      next = next.filter((t) => t.id !== drop.id);
    }
    next = [...next, { id, type, message, action: opts.action, ttlMs }];
    commit(next);
    if (ttlMs !== null) start(id, ttlMs);
    return id;
  }, [clearTimer, commit, start]);

  /** Hovered or focused: stop the clock, so the Undo button doesn't vanish under the pointer. */
  const pause = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (!t || t.timer === null) return;
    clearTimeout(t.timer);
    t.timer = null;
    t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
  }, []);

  const resume = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (!t || t.timer !== null) return;
    start(id, t.remaining);
  }, [start]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => { if (t.timer) clearTimeout(t.timer); });
      map.clear();
    };
  }, []);

  const errors = toasts.filter((t) => t.type === 'error');
  const others = toasts.filter((t) => t.type !== 'error');
  const renderToast = (t: Toast) => (
    <ToastItem key={t.id} toast={t} onDismiss={dismiss} onPause={pause} onResume={resume} />
  );

  return (
    <ToastCtx.Provider value={{ toasts, addToast, dismiss }}>
      {children}
      {createPortal(
        // Both live regions exist, empty, from mount: screen readers ignore a region inserted already holding text.
        <div className="ui-toaster">
          <div role="alert" className="ui-toast-region">{errors.map(renderToast)}</div>
          <div role="status" aria-live="polite" className="ui-toast-region">{others.map(renderToast)}</div>
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}

function ToastItem({ toast: t, onDismiss, onPause, onResume }: ToastItemProps) {
  // Paused while either holds: leaving with the pointer must not restart a toast that has focus.
  const hold = useRef({ hover: false, focus: false });
  const update = (key: 'hover' | 'focus', value: boolean) => {
    hold.current[key] = value;
    if (hold.current.hover || hold.current.focus) onPause(t.id);
    else onResume(t.id);
  };
  return (
    <div
      className={`ui-toast ui-toast--${t.type}`}
      onMouseEnter={() => update('hover', true)}
      onMouseLeave={() => update('hover', false)}
      onFocus={() => update('focus', true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) update('focus', false); }}
    >
      <span className="ui-toast-message">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => { onDismiss(t.id); t.action!.onClick(); }}
        >
          {t.action.label}
        </button>
      )}
      <IconButton label="Dismiss notification" icon={X} iconSize={16} className="ui-toast-dismiss" onClick={() => onDismiss(t.id)} />
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) return { toasts: [], addToast: () => '', dismiss: () => {} };
  return ctx;
}
