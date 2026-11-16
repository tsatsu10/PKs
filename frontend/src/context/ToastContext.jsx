/* eslint-disable react-refresh/only-export-components -- context exports provider + hook */
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext(null);

const TOAST_TTL_MS = 4000;
/** How long an Undo toast stays (U5). */
export const UNDO_TTL_MS = 6000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  /** id -> { timer, remaining, startedAt }. A paused toast has no timer. */
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t.timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const start = useCallback((id, ms) => {
    timers.current.set(id, { timer: setTimeout(() => dismiss(id), ms), remaining: ms, startedAt: Date.now() });
  }, [dismiss]);

  /** opts.action: { label, onClick } adds a button (e.g. Undo); opts.ttlMs overrides the lifetime. Returns the id. */
  const addToast = useCallback((type, message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message, action: opts.action }]);
    start(id, opts.ttlMs ?? TOAST_TTL_MS);
    return id;
  }, [start]);

  /** Hovered or focused: stop the clock, so the Undo button doesn't vanish under the pointer. */
  const pause = useCallback((id) => {
    const t = timers.current.get(id);
    if (!t || t.timer === null) return;
    clearTimeout(t.timer);
    t.timer = null;
    t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
  }, []);

  const resume = useCallback((id) => {
    const t = timers.current.get(id);
    if (!t || t.timer !== null) return;
    start(id, t.remaining);
  }, [start]);

  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach((t) => clearTimeout(t.timer)); map.clear(); };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismiss }}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismiss} onPause={pause} onResume={resume} />
    </ToastContext.Provider>
  );
}

function ToastList({ toasts, onDismiss, onPause, onResume }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} onPause={onPause} onResume={onResume} />
      ))}
    </div>
  );
}

function Toast({ toast: t, onDismiss, onPause, onResume }) {
  // Paused while either holds: leaving with the pointer must not restart a toast that has focus.
  const hold = useRef({ hover: false, focus: false });
  const update = (key, value) => {
    hold.current[key] = value;
    if (hold.current.hover || hold.current.focus) onPause(t.id);
    else onResume(t.id);
  };
  return (
    <div
      className={`toast toast-${t.type}`}
      role="alert"
      aria-live="polite"
      onMouseEnter={() => update('hover', true)}
      onMouseLeave={() => update('hover', false)}
      onFocus={() => update('focus', true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) update('focus', false); }}
    >
      <span className="toast-message">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => { onDismiss(t.id); t.action.onClick(); }}
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-dismiss"
        onClick={() => onDismiss(t.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { addToast: () => '', dismiss: () => {} };
  return ctx;
}
