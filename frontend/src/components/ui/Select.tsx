import { forwardRef, type SelectHTMLAttributes } from 'react';
import './Input.css';
import './Select.css';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={['ui-select', className].filter(Boolean).join(' ')}
      aria-invalid={invalid ? true : undefined}
      {...rest}
    >
      {children}
    </select>
  );
});

export default Select;
