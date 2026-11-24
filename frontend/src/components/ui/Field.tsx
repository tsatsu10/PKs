import { useId, type ReactNode } from 'react';
import './Spinner.css'; // .ui-visually-hidden
import './Field.css';

export interface FieldIds {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  labelHidden?: boolean;
  className?: string;
  children: (ids: FieldIds) => ReactNode;
}

/** Label, hint and error wired to one control by id. The control comes from the render prop. */
export default function Field({ label, hint, error, labelHidden = false, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={labelHidden ? 'ui-field-label ui-visually-hidden' : 'ui-field-label'}>
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && <p id={hintId} className="ui-field-hint">{hint}</p>}
      {error && <p id={errorId} className="ui-field-error" role="alert">{error}</p>}
    </div>
  );
}
