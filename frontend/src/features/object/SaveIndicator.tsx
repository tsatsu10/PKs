import type { SaveState } from './save/saveQueue';

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
export default function SaveIndicator({ state }: { state: SaveState }) {
  const text = saveIndicatorText(state);
  const problem = state.status === 'retrying' || state.status === 'offline' || state.status === 'blocked';
  return (
    <span
      role="status"
      aria-live="polite"
      className={`save-indicator save-indicator--${state.status}${problem ? ' save-indicator--problem' : ''}`}
    >
      {text}
    </span>
  );
}
