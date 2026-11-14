import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clear } from 'idb-keyval';
import {
  localCopyKey, readLocalCopy, writeLocalCopy, writeLocalCopyNow, deleteLocalCopy, deleteLocalCopies,
} from './localCopy';

const copy = (title: string) => ({ fields: { title }, baseRevision: 3 });

beforeEach(async () => {
  await clear();
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
});
