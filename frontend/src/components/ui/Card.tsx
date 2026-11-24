import { useId, type ReactNode } from 'react';
import './Card.css';

export interface CardProps {
  as?: 'section' | 'div' | 'article';
  title?: string;
  titleLevel?: 2 | 3;
  actions?: ReactNode;
  className?: string;
  id?: string;
  children: ReactNode;
}

export default function Card({ as: Tag = 'div', title, titleLevel = 3, actions, className, id, children }: CardProps) {
  const headingId = useId();
  const Heading = titleLevel === 2 ? 'h2' : 'h3';
  const labelled = title && Tag === 'section' ? headingId : undefined;
  return (
    <Tag id={id} className={['ui-card', className].filter(Boolean).join(' ')} aria-labelledby={labelled}>
      {(title || actions) && (
        <div className="ui-card-header">
          {title && <Heading id={headingId} className="ui-card-title">{title}</Heading>}
          {actions && <div className="ui-card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
