import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import './IconButton.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon: LucideIcon;
  variant?: 'ghost' | 'secondary';
  iconSize?: 16 | 20 | 24;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, variant = 'ghost', iconSize = 20, type = 'button', className, ...rest },
  ref,
) {
  const classes = ['ui-icon-button', `ui-icon-button--${variant}`, className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={classes} aria-label={label} title={label} {...rest}>
      <Icon size={iconSize} aria-hidden="true" />
    </button>
  );
});

export default IconButton;
