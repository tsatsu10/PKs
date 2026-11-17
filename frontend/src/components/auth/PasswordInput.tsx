import { useState, forwardRef, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  id: string;
  autoComplete?: string;
  invalid?: boolean;
  describedBy?: string;
};

/**
 * Password input with a Show/Hide toggle on the right (design: mobile auth).
 * The toggle is a real button, labelled for screen readers, and the input keeps
 * its autocomplete attribute so password managers still work.
 */
const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { id, autoComplete = 'current-password', invalid, describedBy, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-password">
      <input
        ref={ref}
        id={id}
        type={visible ? 'text' : 'password'}
        className="auth-input auth-input--password"
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      <button
        type="button"
        className="auth-password-toggle"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
});

export default PasswordInput;
