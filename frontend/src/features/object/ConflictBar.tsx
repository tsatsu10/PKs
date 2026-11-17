import { useState } from 'react';
import { useToast } from '../../components/ui/Toaster';
import { useNotifyError } from '../../lib/useNotifyError';
import type { SaveQueue } from './save/saveQueue';

export const HISTORY_ANCHOR = 'version-history';

/**
 * Shown when a save hit a newer revision. Autosave is paused until the user picks a side;
 * either way the other side's text is kept in version history.
 */
export default function ConflictBar({ queue, onLoaded }: { queue: SaveQueue; onLoaded?: () => void }) {
  const [busy, setBusy] = useState(false);
  const notifyError = useNotifyError();
  const { addToast } = useToast() as { addToast: (type: string, message: string) => void };

  async function run(action: () => Promise<void>, done?: () => void) {
    setBusy(true);
    try {
      await action();
      done?.();
    } catch (err) {
      notifyError(err, 'Could not resolve the conflict');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="conflict-bar" role="alert">
      <p className="conflict-bar-text">This changed elsewhere.</p>
      <div className="conflict-bar-actions">
        <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => run(() => queue.keepMine())}>
          Keep mine
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          disabled={busy}
          onClick={() => run(() => queue.loadTheirs(), () => { addToast('success', 'Your version was saved to history'); onLoaded?.(); })}
        >
          Load theirs
        </button>
        <a
          href={`#${HISTORY_ANCHOR}`}
          className="conflict-bar-link"
          onClick={(e) => {
            const target = document.getElementById(HISTORY_ANCHOR);
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          View their version in History
        </a>
      </div>
    </div>
  );
}
