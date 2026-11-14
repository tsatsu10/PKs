import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SaveIndicator from './SaveIndicator';
import type { SaveState } from './save/saveQueue';

const cases: Array<[SaveState, string]> = [
  [{ status: 'idle', message: null }, ''],
  [{ status: 'pending', message: null }, 'Saving…'],
  [{ status: 'saving', message: null }, 'Saving…'],
  [{ status: 'saved', message: null }, 'Saved ✓'],
  [{ status: 'retrying', message: null }, 'Not saved: retrying'],
  [{ status: 'offline', message: null }, 'Not saved: offline'],
  [{ status: 'blocked', message: 'This object was deleted' }, 'Not saved: This object was deleted'],
  [{ status: 'conflict', message: null }, ''],
];

describe('SaveIndicator', () => {
  it.each(cases)('%o shows "%s"', (state, text) => {
    render(<SaveIndicator state={state} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region.textContent).toBe(text);
  });
});
