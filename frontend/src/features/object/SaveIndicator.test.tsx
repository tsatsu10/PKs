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

const createCases: Array<[SaveState['status'], 'pending' | 'failed', string, boolean]> = [
  ['pending', 'pending', 'Creating…', false],
  ['saving', 'pending', 'Creating…', false],
  ['pending', 'failed', 'Not saved: not created yet', true],
  ['saving', 'failed', 'Not saved: not created yet', true],
  // Nothing typed: the failed-create bar speaks for itself.
  ['idle', 'pending', '', false],
  ['idle', 'failed', '', false],
  // The connection is the more specific reason.
  ['offline', 'pending', 'Not saved: offline', true],
];

describe('SaveIndicator while the object is being created', () => {
  it.each(createCases)('%s with create %s shows "%s"', (status, create, text, problem) => {
    render(<SaveIndicator state={{ status, message: null }} create={create} />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe(text);
    expect(region.classList.contains('save-indicator--problem')).toBe(problem);
  });
});
