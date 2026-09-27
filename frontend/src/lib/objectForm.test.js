import { describe, it, expect } from 'vitest';
import { objectToEditForm, buildObjectPatch, draftFromForm, formFromDraft } from './objectForm';

const object = {
  id: 'abcdef12-0000-0000-0000-000000000000',
  title: 'Q3 plan',
  content: 'Body',
  summary: null,
  source: null,
  status: 'active',
  due_at: '2026-03-10T15:30:00+00:00',
  remind_at: null,
  cover_url: null,
  current_version: 4,
};

describe('buildObjectPatch', () => {
  it('returns an empty patch when nothing changed (including due_at format differences)', () => {
    expect(buildObjectPatch(object, objectToEditForm(object))).toEqual({});
  });

  it('sends only changed fields, so other tabs\' edits are not reverted', () => {
    const form = { ...objectToEditForm(object), status: 'archived' };
    expect(buildObjectPatch(object, form)).toEqual({ status: 'archived' });
  });

  it('adds a slug when the title changes', () => {
    const form = { ...objectToEditForm(object), title: '  Q4 Plan  ' };
    expect(buildObjectPatch(object, form)).toEqual({ title: 'Q4 Plan', slug: 'q4-plan-abcdef12' });
  });

  it('normalizes blank strings to null and clears dates', () => {
    const form = { ...objectToEditForm(object), content: '   ', due_at: '' };
    expect(buildObjectPatch(object, form)).toEqual({ content: null, due_at: null });
  });

  it('treats a null status on the row as active', () => {
    const row = { ...object, status: null };
    expect(buildObjectPatch(row, objectToEditForm(row))).toEqual({});
  });
});

describe('drafts keep the version they were based on', () => {
  it('round-trips form and base version', () => {
    const form = { ...objectToEditForm(object), title: 'Draft title' };
    const draft = draftFromForm(form, 4);
    const restored = formFromDraft(draft, { ...object, current_version: 6 });
    expect(restored.baseVersion).toBe(4);
    expect(restored.form.title).toBe('Draft title');
    expect(restored.form).not.toHaveProperty('_baseVersion');
  });

  it('falls back to the current version for drafts saved before this change', () => {
    const legacy = { title: 'Old draft' };
    const restored = formFromDraft(legacy, object);
    expect(restored.baseVersion).toBe(4);
    expect(restored.form.content).toBe('Body');
  });
});
