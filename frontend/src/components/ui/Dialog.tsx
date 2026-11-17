import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import IconButton from './IconButton';
import { isTopDialog, popDialog, pushDialog } from './dialogStack';
import './Dialog.css';

export type DialogCloseReason = 'escape' | 'backdrop' | 'close-button';

export interface DialogProps {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  title: string;
  description?: string;
  variant?: 'center' | 'drawer';
  size?: 'sm' | 'md' | 'lg';
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),summary';

/** Nesting depth, so a dialog opened from inside another ranks above it. */
const DepthContext = createContext(0);

/**
 * Modal dialog or drawer. Owns focus (initial focus, Tab trap, restore), Escape, scroll lock and
 * `inert` on #root. Each dialog portals into its own container in <body>; the keydown listener sits
 * on that container, after React's own listener there, so React handlers inside still run while page
 * shortcuts on document never see the key.
 */
export default function Dialog({
  open,
  onClose,
  title,
  description,
  variant = 'center',
  size = 'md',
  initialFocusRef,
  footer,
  className,
  children,
}: DialogProps) {
  const id = useId();
  const depth = useContext(DepthContext) + 1;
  const [container] = useState(() => document.createElement('div'));
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    if (!open) return undefined;
    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  }, [open, container]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pushDialog(id, depth);
    if (isTopDialog(id)) {
      const target =
        initialFocusRef?.current ?? bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current;
      target?.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (!isTopDialog(id)) return;
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        onCloseRef.current('escape');
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !active || active === panel || !panel.contains(active);
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('keydown', onKeyDown);
      popDialog(id);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, id, depth, container, initialFocusRef]);

  if (!open) return null;

  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;
  const panelClass = [
    'ui-dialog-panel',
    `ui-dialog-panel--${variant}`,
    variant === 'center' ? `ui-dialog-panel--${size}` : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <DepthContext.Provider value={depth}>
      <div className={`ui-dialog-layer ui-dialog-layer--${variant}`}>
        <div role="presentation" className="ui-dialog-backdrop" onClick={() => onClose('backdrop')} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={panelClass}
        >
          <div className="ui-dialog-header">
            <div className="ui-dialog-heading">
              <h2 id={titleId} className="ui-dialog-title">{title}</h2>
              {description && <p id={descriptionId} className="ui-dialog-description">{description}</p>}
            </div>
            <IconButton label="Close" icon={X} onClick={() => onClose('close-button')} />
          </div>
          <div ref={bodyRef} className="ui-dialog-body">{children}</div>
          {footer && <div className="ui-dialog-footer">{footer}</div>}
        </div>
      </div>
    </DepthContext.Provider>,
    container,
  );
}
