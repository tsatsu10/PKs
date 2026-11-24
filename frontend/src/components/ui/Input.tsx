import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
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

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={['ui-input', 'ui-textarea', className].filter(Boolean).join(' ')}
      aria-invalid={invalid ? true : undefined}
      {...rest}
    />
  );
});

export default Input;
