import { useEffect, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import './OfflineBanner.css';

type State = 'online' | 'offline' | 'back';

/** App-wide connection banner. Queries pause while offline and resume on reconnect. */
export default function OfflineBanner() {
  const [state, setState] = useState<State>(() => (onlineManager.isOnline() ? 'online' : 'offline'));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onlineManager.subscribe((isOnline) => {
      clearTimeout(timer);
      if (!isOnline) { setState('offline'); return; }
      setState((prev) => (prev === 'offline' ? 'back' : prev));
      timer = setTimeout(() => setState('online'), 3000);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);
  if (state === 'online') return null;
  return (
    <div className={`offline-banner offline-banner-${state}`} role="status" aria-live="polite">
      {state === 'offline' ? "You're offline. Showing saved data." : 'Back online.'}
    </div>
  );
}
