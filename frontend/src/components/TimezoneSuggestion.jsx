import { browserTimeZone } from '../lib/timezone';

/**
 * Stored timezones are never rewritten (an old Accra default can't be told apart from a chosen
 * one), so offer the browser's zone when it differs. Filling the field doesn't save it.
 */
export default function TimezoneSuggestion({ stored, onUse }) {
  const zone = browserTimeZone();
  if (!stored || stored === zone) return null;
  return (
    <p className="settings-timezone-suggestion">
      Your browser says {zone}. Use it?{' '}
      <button type="button" className="btn btn-ghost btn-small" onClick={() => onUse(zone)}>Use it</button>
    </p>
  );
}
