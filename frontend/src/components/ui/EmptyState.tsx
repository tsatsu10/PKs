import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import './EmptyState.css';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

/** The title is a paragraph, not a heading, so it never breaks the page outline. */
export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="ui-empty">
      {Icon && <Icon size={24} aria-hidden="true" className="ui-empty-icon" />}
      <p className="ui-empty-title">{title}</p>
      {description && <div className="ui-empty-description">{description}</div>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
