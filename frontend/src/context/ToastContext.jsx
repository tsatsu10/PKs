/* eslint-disable react-refresh/only-export-components -- context exports provider + hook */
import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

const TOAST_TTL_MS = 4000;
/** How long an Undo toast stays (U5). */
export const UNDO_TTL_MS = 6000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  /** opts.action: { label, onClick } adds a button (e.g. Undo); opts.ttlMs overrides the lifetime. Returns the id. */
  const addToast = useCallback((type, message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message, action: opts.action }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, opts.ttlMs ?? TOAST_TTL_MS);
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismiss }}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastList({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          role="alert"
          aria-live="polite"
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
      ))}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { addToast: () => '', dismiss: () => {} };
  return ctx;
}
