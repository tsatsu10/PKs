import { forwardRef, type InputHTMLAttributes } from 'react';
import './Input.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={['ui-input', className].filter(Boolean).join(' ')}
      aria-invalid={invalid ? true : undefined}
      {...rest}
    />
  );
});

export default Input;
