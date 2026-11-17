import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { stubMatchMedia } from '../../../test/matchMedia';
import ActivityDrawer from './ActivityDrawer';

let root;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup();
  root.remove();
  vi.restoreAllMocks();
});

const narrow = () => stubMatchMedia(() => false);
const wide = () => stubMatchMedia((q) => q.includes('min-width: 1280px'));

describe('ActivityDrawer', () => {
  it('opens as a modal drawer on narrow screens', () => {
    narrow();
    const { rerender } = render(<ActivityDrawer open={false} onClose={() => {}}><p>Pulse</p></ActivityDrawer>, { container: root });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Pulse')).toBeNull();
    rerender(<ActivityDrawer open onClose={() => {}}><p>Pulse</p></ActivityDrawer>);
    const dialog = screen.getByRole('dialog', { name: 'Activity' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Pulse');
    expect(root.hasAttribute('inert')).toBe(true);
  });

  it('closes on Escape', () => {
    narrow();
    const onClose = vi.fn();
    render(<ActivityDrawer open onClose={onClose}><button type="button">Tag</button></ActivityDrawer>, { container: root });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Tag' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays inline on wide screens', () => {
    wide();
    render(<ActivityDrawer open={false} onClose={() => {}}><p>Pulse</p></ActivityDrawer>, { container: root });
    expect(screen.getByRole('complementary', { name: 'Activity' })).toHaveTextContent('Pulse');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(root.hasAttribute('inert')).toBe(false);
  });
});
