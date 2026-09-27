import { useState, useSyncExternalStore } from 'react';
import { subscribeUpdate, isUpdateAvailable, applyUpdate } from '../lib/pwaUpdate';

/** Bottom bar shown when a new app version is ready; reloads only on request. */
export default function UpdatePrompt() {
  const available = useSyncExternalStore(subscribeUpdate, isUpdateAvailable, isUpdateAvailable);
  const [dismissed, setDismissed] = useState(false);
  if (!available || dismissed) return null;
  return (
    <div className="update-prompt" role="status">
      <span>A new version of PKS is available.</span>
      <button type="button" className="btn btn-primary btn-small" onClick={applyUpdate}>Reload</button>
      <button type="button" className="btn btn-secondary btn-small" onClick={() => setDismissed(true)}>Later</button>
    </div>
  );
}
