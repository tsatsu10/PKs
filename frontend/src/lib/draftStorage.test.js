import { describe, it, expect, beforeEach } from 'vitest';
import { setDraft, getDraft, clearAllDrafts, DRAFT_KEYS, DRAFT_OWNER_KEY } from './draftStorage';

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(DRAFT_OWNER_KEY, 'u1');
});

describe('setDraft', () => {
  it('setDraft with an owner writes', () => {
    setDraft(DRAFT_KEYS.new, { form: { title: 'mine' } });
    expect(getDraft(DRAFT_KEYS.new)).toEqual({ form: { title: 'mine' } });
  });

  it('setDraft without an owner does nothing', () => {
    // e.g. a 500ms draft timer firing after logout cleared the owner, while signOut is pending
    sessionStorage.removeItem(DRAFT_OWNER_KEY);
    setDraft(DRAFT_KEYS.new, { form: { title: 'leaked' } });
    expect(sessionStorage.getItem(DRAFT_KEYS.new)).toBeNull();
  });
});

describe('clearAllDrafts', () => {
  it('removes every PKS draft and leaves other session keys alone', () => {
    setDraft(DRAFT_KEYS.new, { form: { title: 'a' } });
    setDraft(DRAFT_KEYS.object('123'), { title: 'b' });
    sessionStorage.setItem('other-app-key', 'keep');
    clearAllDrafts();
    expect(getDraft(DRAFT_KEYS.new)).toBeNull();
    expect(getDraft(DRAFT_KEYS.object('123'))).toBeNull();
    expect(sessionStorage.getItem('other-app-key')).toBe('keep');
  });
});
