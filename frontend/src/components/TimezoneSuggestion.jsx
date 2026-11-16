import { browserTimeZone } from '../lib/timezone';

/**
 * Stored timezones are never rewritten (an old Accra default can't be told apart from a chosen
 * one), so offer the browser's zone when it differs. Filling the field doesn't save it.
 *
 * `stored` is the server's value (null/empty = none, so the server uses UTC); `value` is the
 * form field, which the page pre-fills with the browser's zone when nothing is stored.
 */
export default function TimezoneSuggestion({ stored, value, onUse }) {
  const zone = browserTimeZone();
  if (stored === zone) return null;
  if (!stored) {
    return (
      <p className="settings-timezone-suggestion" role="status">
        No timezone is saved yet, so dates on the server use UTC.{' '}
        {value === zone ? (
          <>Save your profile to use {zone}.</>
        ) : (
          <>
            Your browser says {zone}. Use it?{' '}
            <button type="button" className="btn btn-ghost btn-small" onClick={() => onUse(zone)}>Use it</button>
          </>
        )}
      </p>
    );
  }
  if (value === zone) return null;
  return (
    <p className="settings-timezone-suggestion">
      Your browser says {zone}. Use it?{' '}
      <button type="button" className="btn btn-ghost btn-small" onClick={() => onUse(zone)}>Use it</button>
    </p>
  );
}
