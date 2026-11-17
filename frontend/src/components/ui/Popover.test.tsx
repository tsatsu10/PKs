import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Popover from './Popover';

function renderPopover() {
  render(
    <>
      <button type="button">Elsewhere</button>
      <Popover
        label="Sort options"
        trigger={(props) => <button type="button" {...props}>Sort</button>}
      >
        {(close) => <button type="button" onClick={close}>Newest first</button>}
      </Popover>
    </>,
  );
  return screen.getByRole('button', { name: 'Sort' });
}

describe('Popover', () => {
  it('toggles aria-expanded and closes on Escape with focus back on the trigger', () => {
    const trigger = renderPopover();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('dialog', { name: 'Sort options' });
    expect(trigger).toHaveAttribute('aria-controls', panel.id);
    const item = screen.getByRole('button', { name: 'Newest first' });
    item.focus();
    fireEvent.keyDown(item, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on an outside pointerdown', () => {
    const trigger = renderPopover();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when focus leaves the panel', () => {
    const trigger = renderPopover();
    fireEvent.click(trigger);
    const item = screen.getByRole('button', { name: 'Newest first' });
    fireEvent.focusOut(item, { relatedTarget: screen.getByRole('button', { name: 'Elsewhere' }) });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lets content close it', () => {
    const trigger = renderPopover();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Newest first' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
