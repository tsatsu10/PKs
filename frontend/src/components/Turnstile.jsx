import { useEffect, useRef } from 'react';
import { loadTurnstile } from '../lib/turnstile';

/**
 * Cloudflare Turnstile widget. onToken receives the token, or '' when it expires or fails,
 * so the form can block submit until a fresh token exists. Remount (change `key`) after a
 * failed submit: tokens are single-use.
 */
export default function Turnstile({ siteKey, onToken }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!siteKey) return undefined;
    let widgetId;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !ref.current) return;
        widgetId = turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch(() => onToken(''));
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="turnstile-widget" />;
}
