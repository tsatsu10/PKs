import type { ReactNode } from 'react';

/**
 * Auth form field: label above the control, with an optional trailing action
 * (e.g. "Forgot password?") and an optional error/hint line below.
 * The label is always visible (no floating pattern), per the auth design.
 */
export default function AuthField({
  id,
  label,
  trailing,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  trailing?: ReactNode;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="auth-field">
      <div className="auth-field-row">
        <label className="auth-label" htmlFor={id}>
          {label}
        </label>
        {trailing}
      </div>
      {children}
      {error ? (
        <p className="auth-field-error" id={messageId} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p className="auth-field-hint" id={messageId}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
