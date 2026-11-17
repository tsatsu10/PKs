import { useMediaQuery } from '@mantine/hooks';
import Dialog from '../../../components/ui/Dialog';
import { ACTIVITY_INLINE_QUERY } from '../../../breakpoints';

/**
 * The dashboard's activity panel (M9): an inline sidebar at 1280px and wider, where `open` is
 * ignored; below that, a modal drawer that traps focus, closes on Escape and inerts the page.
 */
export default function ActivityDrawer({ open, onClose, children }) {
  const inline = useMediaQuery(ACTIVITY_INLINE_QUERY, false, { getInitialValueInEffect: false });
  if (inline) {
    return (
      <aside className="dashboard-sidebar" aria-label="Activity">
        {children}
      </aside>
    );
  }
  return (
    <Dialog variant="drawer" title="Activity" open={open} onClose={() => onClose()}>
      {children}
    </Dialog>
  );
}
