import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import './Popover.css';

export interface PopoverTriggerProps {
  ref: Ref<HTMLButtonElement>;
  'aria-expanded': boolean;
  'aria-controls': string;
  onClick: () => void;
}

export interface PopoverProps {
  trigger: (props: PopoverTriggerProps) => ReactNode;
  label: string;
  align?: 'start' | 'end';
  children: ReactNode | ((close: () => void) => ReactNode);
}

/**
 * Non-modal panel under a trigger: no focus trap, no inert. Closes on Escape (focus back to the
 * trigger), on a pointerdown outside, and when focus leaves it. Escape is handled by a native
 * listener, and marked handled so an enclosing Dialog doesn't close too.
 */
export default function Popover({ trigger, label, align = 'start', children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && (panel.contains(next) || triggerRef.current?.contains(next))) return;
      if (next) setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    panel.addEventListener('keydown', onKeyDown);
    panel.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      panel.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="ui-popover">
      {trigger({
        ref: triggerRef,
        'aria-expanded': open,
        'aria-controls': panelId,
        onClick: () => setOpen((v) => !v),
      })}
      {open && (
        <div ref={panelRef} id={panelId} role="dialog" aria-label={label} className={`ui-popover-panel ui-popover-panel--${align}`}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
