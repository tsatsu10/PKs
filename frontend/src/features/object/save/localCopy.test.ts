import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clear } from 'idb-keyval';
import {
  localCopyKey, readLocalCopy, writeLocalCopy, writeLocalCopyNow, writeLocalCopySync, deleteLocalCopy, deleteLocalCopies,
  deleteOtherUsersLocalCopies,
} from './localCopy';

const copy = (title: string) => ({ fields: { title }, baseRevision: 3 });

beforeEach(async () => {
  await clear();
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => vi.useRealTimers());

describe('localCopy', () => {
  it('keys copies by user and object', () => {
    expect(localCopyKey('u1', 'o1')).toBe('pks-pending-save:u1:o1');
  });

  it('throttles writes to one every 150 ms, keeping the latest value', async () => {
    writeLocalCopy('u1', 'o1', copy('a'));
    writeLocalCopy('u1', 'o1', copy('b'));
    await vi.advanceTimersByTimeAsync(100);
    expect(await readLocalCopy('u1', 'o1')).toBeNull();
    await vi.advanceTimersByTimeAsync(50);
    await vi.waitFor(async () => expect(await readLocalCopy('u1', 'o1')).toEqual(copy('b')));
  });

  it('delete cancels a throttled write that has not happened yet', async () => {
    writeLocalCopy('u1', 'o1', copy('a'));
    await deleteLocalCopy('u1', 'o1');
    await vi.advanceTimersByTimeAsync(200);
    expect(await readLocalCopy('u1', 'o1')).toBeNull();
  });

  it('deleteLocalCopies removes one owner\'s copies, or everyone\'s with null', async () => {
    await writeLocalCopyNow('u1', 'o1', copy('a'));
    await writeLocalCopyNow('u2', 'o1', copy('b'));
    await deleteLocalCopies('u1');
    expect(await readLocalCopy('u1', 'o1')).toBeNull();
    expect(await readLocalCopy('u2', 'o1')).toEqual(copy('b'));
    await deleteLocalCopies(null);
    expect(await readLocalCopy('u2', 'o1')).toBeNull();
  });

  it('a synchronous copy (written as the tab closes) is readable without waiting for IndexedDB', async () => {
    writeLocalCopySync('u1', 'o1', copy('closing'));
    expect(await readLocalCopy('u1', 'o1')).toEqual(copy('closing'));
  });

  it('reads whichever copy is newer', async () => {
    await writeLocalCopyNow('u1', 'o1', copy('older'));
    await vi.advanceTimersByTimeAsync(10);
    writeLocalCopySync('u1', 'o1', copy('newer'));
    expect(await readLocalCopy('u1', 'o1')).toEqual(copy('newer'));
    // The tab came back and kept typing: the IndexedDB copy is newer again.
    await vi.advanceTimersByTimeAsync(10);
    await writeLocalCopyNow('u1', 'o1', copy('newest'));
    expect(await readLocalCopy('u1', 'o1')).toEqual(copy('newest'));
  });

  it('delete removes both copies, so a stale one never comes back', async () => {
    await writeLocalCopyNow('u1', 'o1', copy('a'));
    writeLocalCopySync('u1', 'o1', copy('b'));
    await deleteLocalCopy('u1', 'o1');
    expect(await readLocalCopy('u1', 'o1')).toBeNull();
  });

  it('sign-out and sign-in cleanups remove synchronous copies too', async () => {
    writeLocalCopySync('u1', 'o1', copy('a'));
    writeLocalCopySync('u2', 'o1', copy('b'));
    await deleteOtherUsersLocalCopies('u2');
    expect(await readLocalCopy('u1', 'o1')).toBeNull();
    expect(await readLocalCopy('u2', 'o1')).toEqual(copy('b'));
    await deleteLocalCopies('u2');
    expect(await readLocalCopy('u2', 'o1')).toBeNull();
  });

  it('a synchronous copy that does not fit is skipped without throwing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(() => writeLocalCopySync('u1', 'o1', copy('big'))).not.toThrow();
    setItem.mockRestore();
  });
});
