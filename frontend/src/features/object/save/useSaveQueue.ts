import { useEffect, useState, useSyncExternalStore } from 'react';
import { openSaveQueue, type SaveFields, type SaveQueue, type SaveState } from './saveQueue';

type Restored = { fields: SaveFields; baseRevision: number };
type Opened = { objectId: string; queue: SaveQueue; restored: Restored | null };

const IDLE: SaveState = { status: 'idle', message: null };
const noSubscribe = () => () => {};
const idle = () => IDLE;

/**
 * The page's handle on an object's save queue. `seed` changes when the queue reloads the
 * object (Load theirs, restore), so fields and the editor can key on `${objectId}:${seed}`.
 * Leaving the page sends whatever is still inside the debounce window.
 */
export function useSaveQueue({ objectId, userId, isOwner, baseRevision }: {
  objectId: string | undefined; userId: string | undefined; isOwner: boolean; baseRevision: number | undefined;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [seed, setSeed] = useState(0);
  const ready = baseRevision !== undefined;

  useEffect(() => {
    if (!objectId || !userId || !ready) return undefined;
    let live = true;
    let queue: SaveQueue | null = null;
    let stopReload = () => {};
    const leave = (q: SaveQueue) => { void q.flush().finally(() => q.dispose()); };
    void openSaveQueue({ objectId, userId, isOwner, baseRevision: baseRevision as number }).then((result) => {
      if (!live) { leave(result.queue); return; }
      queue = result.queue;
      stopReload = queue.onReloaded(() => setSeed((s) => s + 1));
      setOpened({ objectId, queue: result.queue, restored: result.restored });
    });
    return () => {
      live = false;
      stopReload();
      if (queue) leave(queue);
    };
    // baseRevision only matters when the queue is first opened.
  }, [objectId, userId, isOwner, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = opened && opened.objectId === objectId ? opened : null;
  const queue = current?.queue ?? null;
  const state = useSyncExternalStore(queue ? queue.subscribe : noSubscribe, queue ? queue.getState : idle);
  return { ready: current !== null, queue, state, restored: current?.restored ?? null, seed };
}
