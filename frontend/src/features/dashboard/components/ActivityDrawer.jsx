import { useEffect } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import Dialog from '../../../components/ui/Dialog';
import { ACTIVITY_INLINE_QUERY } from '../../../breakpoints';

const noop = () => {};

/**
 * The dashboard's activity panel (M9): an inline sidebar at 1280px and wider, where `open` is
 * ignored; below that, a modal drawer that traps focus, closes on Escape and inerts the page.
 * `children` may be a function of `dismiss`: content that changes the page behind the drawer
 * calls it, so the change is visible (it does nothing inline).
 */
export default function ActivityDrawer({ open, onClose, children }) {
  const inline = useMediaQuery(ACTIVITY_INLINE_QUERY, false, { getInitialValueInEffect: false });
  useEffect(() => {
    if (inline && open) onClose();
  }, [inline, open, onClose]);
  const content = typeof children === 'function' ? children(inline ? noop : () => onClose()) : children;
  if (inline) {
    return (
      <aside className="dashboard-sidebar" aria-label="Activity">
        {content}
      </aside>
    );
  }
  return (
    <Dialog variant="drawer" title="Activity" open={open} onClose={() => onClose()}>
      {content}
    </Dialog>
  );
}
