import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import Spinner from './Spinner';
import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const classes = (variant: Variant, size: Size, className?: string) =>
  ['ui-button', `ui-button--${variant}`, `ui-button--${size}`, className].filter(Boolean).join(' ');

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, type = 'button', disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {loading && <Spinner size="sm" decorative />}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
}

/** Navigation that looks like a button: a real link, so it opens in a new tab and has no disabled state. */
export function ButtonLink({ variant = 'secondary', size = 'md', className, ...rest }: ButtonLinkProps) {
  return <Link className={classes(variant, size, className)} {...rest} />;
}

export default Button;
