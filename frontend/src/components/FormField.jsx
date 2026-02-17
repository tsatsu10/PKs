/**
 * World-class form field: label, optional hint below input, inline error.
 * Use for single-column forms with clear, accessible UX (NN/G, WCAG).
 * Pass the input as children; set id and aria-describedby on it when using hint/error.
 */
export default function FormField({
  id,
  label,
  required,
  hint,
  error,
  children,
  className = '',
}) {
  return (
    <div className={`form-group ${className}`.trim()}>
      <label htmlFor={id} className="form-label">
        {label}
        {required && <span className="required" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
