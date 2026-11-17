/** Types and constants shared by the save engine (see saveQueue.ts). */
import type { QueryClient } from '@tanstack/react-query';
export type SaveFields = Partial<{
  title: string; content: string; content_json: unknown[] | null; summary: string | null;
  key_points: unknown[]; type: string; status: string; source: string | null;
  due_at: string | null; remind_at: string | null; cover_url: string | null;
}>;
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'retrying' | 'offline' | 'conflict' | 'blocked';
export type SaveState = { status: SaveStatus; message: string | null };
export interface SaveQueue {
  readonly objectId: string;
  getState(): SaveState;
  subscribe(listener: () => void): () => void;
  change(fields: SaveFields): void;
  /** Send now, skipping the debounce; resolves when nothing is pending or the queue is not sending. */
  flush(): Promise<void>;
  pending(): SaveFields;
  baseRevision(): number;
  /** Stop timers and listeners; keeps the local copy. */
  dispose(): void;
  /** Conflict: save their version to history, then overwrite it with mine. */
  keepMine(): Promise<void>;
  /** Conflict: save my unsent edit to history, drop it, and reload theirs (emits onReloaded). */
  loadTheirs(): Promise<void>;
  /** Save version: flush, then snapshot the current row. Resolves to the new version number. */
  snapshot(reason?: string): Promise<number>;
  /** Restore: flush, snapshot the current row, then save the version's fields (emits onReloaded). */
  /** Restore `v`: resolves to the version number of the snapshot taken just before (for Undo). */
  applyVersion(v: VersionFields): Promise<number>;
  /** The fields on the page must be re-seeded from the server row plus pending(). */
  onReloaded(listener: () => void): () => void;
  /**
   * A newer server row arrived (e.g. the refetch after opening from a cached copy). With nothing
   * typed yet, move the base to it and re-seed the page (emits onReloaded); otherwise leave it.
   */
  adoptServerRevision(revision: number): void;
}
export type VersionFields = {
  version: number; title: string; content: string | null; content_json: unknown[] | null;
  summary: string | null; key_points: unknown;
};

export const DEBOUNCE_MS = 800;
export const MAX_WAIT_MS = 5000;
export const SAVED_FADE_MS = 2000;
export const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];
export const DELETED_MESSAGE = 'This object was deleted';
export const NO_ACCESS_MESSAGE = 'You no longer have edit access';
export const KEEP_MINE_REASON = 'Kept from a conflict before overwrite';
export const LOAD_THEIRS_REASON = 'Unsaved edit kept from a conflict';
export const SNAPSHOT_KEYS = ['title', 'content', 'content_json', 'summary', 'key_points'] as const;

export const OWNER_ONLY = ['type', 'status', 'due_at', 'remind_at', 'cover_url'] as const;
export type Patch = SaveFields & { slug?: string | null };
export type Row = Record<string, unknown> & { id: string; revision: number; title?: string; updated_at?: string; current_version?: number };

export type Options = { objectId: string; userId: string; isOwner: boolean; baseRevision: number; client?: QueryClient };
