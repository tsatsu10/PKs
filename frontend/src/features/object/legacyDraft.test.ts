import { describe, it, expect, beforeEach } from 'vitest';
import { adoptLegacyDraft } from './legacyDraft';

beforeEach(() => sessionStorage.clear());

describe('adoptLegacyDraft', () => {
  it('maps a pre-2b edit draft to save fields with its base revision, and removes it', () => {
    sessionStorage.setItem('pks-draft-o1', JSON.stringify({
      title: 'Drafted', content: 'Body', summary: '', source: 'https://x.example', status: 'archived',
      due_at: '', remind_at: '', cover_url: '', _baseRevision: 3,
    }));
    expect(adoptLegacyDraft('o1')).toEqual({
      fields: {
        title: 'Drafted', content: 'Body', content_json: null, summary: null, source: 'https://x.example',
        status: 'archived', due_at: null, remind_at: null, cover_url: null,
      },
      baseRevision: 3,
    });
    expect(sessionStorage.getItem('pks-draft-o1')).toBeNull();
  });

  it('keeps only the fields the draft has; old drafts without a revision give null', () => {
    sessionStorage.setItem('pks-draft-o1', JSON.stringify({ title: 'Only title', _baseVersion: 2 }));
    expect(adoptLegacyDraft('o1')).toEqual({ fields: { title: 'Only title' }, baseRevision: null });
  });

  it('returns null with no draft', () => {
    expect(adoptLegacyDraft('o1')).toBeNull();
  });
});
