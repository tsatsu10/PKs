import { useEffect, useRef, useState } from 'react';
import { loadTurnstile } from '../lib/turnstile';
import Button from './ui/Button';

const TURNSTILE_LOAD_ERROR =
  "The security check couldn't load. Check your connection or allow challenges.cloudflare.com, then retry.";

/**
 * Cloudflare Turnstile widget. onToken receives the token, or '' when it expires or fails,
 * so the form can block submit until a fresh token exists. Remount (change `key`) after a
 * failed submit: tokens are single-use. If the script can't load or the widget errors, an
 * inline message with a Retry button replaces silence.
 */
export default function Turnstile({ siteKey, onToken }) {
  const ref = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey) return undefined;
    let widgetId;
    let cancelled = false;
    const fail = () => {
      if (cancelled) return;
      setFailed(true);
      onToken('');
    };
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !ref.current) return;
        widgetId = turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => { setFailed(false); onToken(token); },
          'expired-callback': () => onToken(''),
          'error-callback': fail,
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, onToken, attempt]);

  if (!siteKey) return null;
  return (
    <div className="turnstile">
      <div ref={ref} className="turnstile-widget" />
      {failed && (
        <div className="turnstile-error" role="alert" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
          <p style={{ margin: '0 0 0.5rem', color: 'var(--pks-status-danger)' }}>{TURNSTILE_LOAD_ERROR}</p>
          <Button
            size="sm"
            onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
