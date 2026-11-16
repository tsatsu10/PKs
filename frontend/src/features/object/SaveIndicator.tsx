import type { SaveState } from './save/saveQueue';
import type { CreateState } from '../../data/createObject';

type CreateStatus = CreateState['status'];

/** Edits typed into a new object wait for its insert; say that instead of "Saving…". */
function waitingText(status: SaveState['status'], create: CreateStatus): string | null {
  if (status !== 'pending' && status !== 'saving') return null;
  if (create === 'pending') return 'Creating…';
  if (create === 'failed') return 'Not saved: not created yet';
  return null;
}

function saveIndicatorText({ status, message }: SaveState): string {
  switch (status) {
    case 'pending':
    case 'saving': return 'Saving…';
    case 'saved': return 'Saved ✓';
    case 'retrying': return 'Not saved: retrying';
    case 'offline': return 'Not saved: offline';
    case 'blocked': return `Not saved: ${message ?? 'try again later'}`;
    default: return ''; // idle shows nothing; a conflict shows the conflict bar
  }
}

/** Autosave status next to the title. The live region stays mounted so changes are announced. */
export default function SaveIndicator({ state, create = 'none' }: { state: SaveState; create?: CreateStatus }) {
  const waiting = waitingText(state.status, create);
  const text = waiting ?? saveIndicatorText(state);
  const problem = state.status === 'retrying' || state.status === 'offline' || state.status === 'blocked'
    || (waiting !== null && create === 'failed');
  const modifier = waiting !== null ? `create-${create}` : state.status;
  return (
    <span
      role="status"
      aria-live="polite"
      className={`save-indicator save-indicator--${modifier}${problem ? ' save-indicator--problem' : ''}`}
    >
      {text}
    </span>
  );
}
