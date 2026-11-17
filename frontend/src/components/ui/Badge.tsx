import type { LucideIcon } from 'lucide-react';
import './Badge.css';

export interface BadgeProps {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'ai';
  icon?: LucideIcon;
  /** Required text, so a tone is never conveyed by colour alone. */
  children: string;
}

export default function Badge({ tone = 'neutral', icon: Icon, children }: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${tone}`}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}
