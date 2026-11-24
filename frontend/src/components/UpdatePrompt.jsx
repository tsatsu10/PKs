import { useState, useSyncExternalStore } from 'react';
import { subscribeUpdate, isUpdateAvailable, applyUpdate } from '../lib/pwaUpdate';
import Button from './ui/Button';

/** Bottom bar shown when a new app version is ready; reloads only on request. */
export default function UpdatePrompt() {
  const available = useSyncExternalStore(subscribeUpdate, isUpdateAvailable, isUpdateAvailable);
  const [dismissed, setDismissed] = useState(false);
  if (!available || dismissed) return null;
  return (
    <div className="update-prompt" role="status">
      <span>A new version of PKS is available.</span>
      <Button variant="primary" size="sm" onClick={applyUpdate}>Reload</Button>
      <Button size="sm" onClick={() => setDismissed(true)}>Later</Button>
    </div>
  );
}
