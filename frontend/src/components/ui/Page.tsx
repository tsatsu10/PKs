import type { ReactNode } from 'react';
import './Page.css';
import './Spinner.css'; // .ui-visually-hidden

export interface PageProps {
  title: string;
  /** Keep the h1 for assistive tech when the page shows its own visual heading. */
  titleHidden?: boolean;
  actions?: ReactNode;
  width?: 'narrow' | 'default' | 'wide';
  className?: string;
  children?: ReactNode;
}

/** Page root: one h1, optional header actions, a max width. Outer padding below 768px belongs to AppLayout. */
export default function Page({ title, titleHidden = false, actions, width = 'default', className, children }: PageProps) {
  const hidden = titleHidden && !actions;
  return (
    <div className={['ui-page', `ui-page--${width}`, className].filter(Boolean).join(' ')}>
      <header className={hidden ? 'ui-visually-hidden' : 'ui-page-header'}>
        <h1 className={['ui-page-title', titleHidden ? 'ui-visually-hidden' : null].filter(Boolean).join(' ')} tabIndex={-1}>
          {title}
        </h1>
        {actions && <div className="ui-page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
