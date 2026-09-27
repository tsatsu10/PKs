import { describe, it, expect } from 'vitest';
import { setDraft, getDraft, clearAllDrafts, DRAFT_KEYS } from './draftStorage';

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
