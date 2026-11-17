import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ReadOnlyBody from './ReadOnlyBody';
import type { ObjectRow } from './types';

vi.mock('./ContentView', () => ({ default: () => <div data-testid="content-view" /> }));

const OBJECT = {
  id: 'o1',
  user_id: 'owner',
  title: 'Covered note',
  content: '',
  source: null,
  summary: null,
  key_points: [],
  is_deleted: false,
  current_version: 1,
  created_at: '2026-11-17T00:00:00Z',
  updated_at: '2026-11-17T00:00:00Z',
  is_pinned: false,
  status: 'draft',
  slug: 'covered-note',
  cover_url: 'https://covers.example/cover.jpg',
  due_at: null,
  remind_at: null,
  revision: 1,
  type: 'note',
  content_json: null,
} as unknown as ObjectRow;

function renderBody(object: ObjectRow = OBJECT) {
  return render(<ReadOnlyBody object={object} />);
}

describe('ReadOnlyBody cover', () => {
  it('reserves the cover box before the image loads', () => {
    const { container } = renderBody();
    const img = container.querySelector('img.detail-cover');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('decoding', 'async');
    expect(img).toHaveAttribute('width', '1200');
    expect(img).toHaveAttribute('height', '675');
  });

  it('hides a cover that fails to load', () => {
    const { container } = renderBody();
    const img = container.querySelector('img.detail-cover');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector('img.detail-cover')).toBeNull();
  });

  it('renders no cover when the object has none', () => {
    const { container } = renderBody({ ...OBJECT, cover_url: null });
    expect(container.querySelector('img.detail-cover')).toBeNull();
  });
});
