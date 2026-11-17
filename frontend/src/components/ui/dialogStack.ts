/**
 * Open modal dialogs, top last. While any is open the app root is inert and the body can't scroll.
 * Ranked by nesting depth first, then by open order: a parent and its nested confirm can mount in
 * the same commit, and React runs the child's effects first.
 */
interface Entry {
  id: string;
  depth: number;
  seq: number;
}

let entries: Entry[] = [];
let seq = 0;
let savedOverflow: string | null = null;

function applyPageLock(locked: boolean) {
  const root = document.getElementById('root');
  if (locked) {
    root?.setAttribute('inert', '');
    if (savedOverflow === null) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
  } else {
    root?.removeAttribute('inert');
    if (savedOverflow !== null) {
      document.body.style.overflow = savedOverflow;
      savedOverflow = null;
    }
  }
}

export function pushDialog(id: string, depth = 0): void {
  entries = entries.filter((e) => e.id !== id);
  entries.push({ id, depth, seq: ++seq });
  applyPageLock(true);
}

export function popDialog(id: string): void {
  entries = entries.filter((e) => e.id !== id);
  if (entries.length === 0) applyPageLock(false);
}

export function isTopDialog(id: string): boolean {
  let top: Entry | undefined;
  for (const e of entries) {
    if (!top || e.depth > top.depth || (e.depth === top.depth && e.seq > top.seq)) top = e;
  }
  return top?.id === id;
}
