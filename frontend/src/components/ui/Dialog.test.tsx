import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Dialog from './Dialog';
import ConfirmDialog from './ConfirmDialog';

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  document.body.style.overflow = 'scroll';
});

afterEach(() => {
  cleanup();
  root.remove();
  document.body.style.overflow = '';
});

type CloseReason = 'escape' | 'backdrop' | 'close-button';

function Page({ open, onClose = () => {} }: { open: boolean; onClose?: (r: CloseReason) => void }) {
  return (
    <>
      <button type="button">Trigger</button>
      <Dialog open={open} onClose={onClose} title="Run prompt" description="Running against: Note">
        <label htmlFor="p">Prompt</label>
        <textarea id="p" />
        <button type="button">Run</button>
      </Dialog>
    </>
  );
}

function renderPage(open: boolean, onClose?: (r: CloseReason) => void) {
  const utils = render(<Page open={false} onClose={onClose} />, { container: root });
  screen.getByRole('button', { name: 'Trigger' }).focus();
  if (open) utils.rerender(<Page open onClose={onClose} />);
  return utils;
}

describe('Dialog', () => {
  it('is a labelled modal dialog', () => {
    renderPage(true);
    const dialog = screen.getByRole('dialog', { name: 'Run prompt' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Running against: Note');
  });

  it('moves focus in and returns it on close', () => {
    const { rerender } = renderPage(true);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText('Prompt'));
    rerender(<Page open={false} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Trigger' }));
  });

  it('cleans up on unmount', () => {
    // A trigger outside the React tree stays connected after the unmount, as a parent page's would.
    const trigger = document.createElement('button');
    trigger.textContent = 'Outside';
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <Dialog open onClose={() => {}} title="T"><button type="button">Inside</button></Dialog>,
      { container: root },
    );
    expect(root.hasAttribute('inert')).toBe(true);
    unmount();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('keeps page shortcuts out', () => {
    const spy = vi.fn();
    document.addEventListener('keydown', spy);
    renderPage(true);
    fireEvent.keyDown(screen.getByLabelText('Prompt'), { key: '?' });
    expect(spy).not.toHaveBeenCalled();
    document.removeEventListener('keydown', spy);
  });

  it('still runs React key handlers inside the dialog', () => {
    const onKeyDown = vi.fn();
    render(
      <Dialog open onClose={() => {}} title="T">
        <input aria-label="Field" onKeyDown={onKeyDown} />
      </Dialog>,
      { container: root },
    );
    fireEvent.keyDown(screen.getByLabelText('Field'), { key: 'a' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('traps Tab at both ends', () => {
    renderPage(true);
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'Close' });
    const run = screen.getByRole('button', { name: 'Run' });
    run.focus();
    fireEvent.keyDown(run, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(run);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('reports why it closed', () => {
    const onClose = vi.fn();
    renderPage(true, onClose);
    fireEvent.keyDown(screen.getByLabelText('Prompt'), { key: 'Escape' });
    expect(onClose).toHaveBeenLastCalledWith('escape');
    fireEvent.click(document.querySelector('.ui-dialog-backdrop')!);
    expect(onClose).toHaveBeenLastCalledWith('backdrop');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenLastCalledWith('close-button');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close on an Escape a child already handled', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <input aria-label="Field" onKeyDown={(e) => { if (e.key === 'Escape') e.preventDefault(); }} />
      </Dialog>,
      { container: root },
    );
    fireEvent.keyDown(screen.getByLabelText('Field'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('inerts the page and locks scroll while open', () => {
    const { rerender } = renderPage(true);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Page open={false} />);
    expect(root.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('closes only the top dialog on Escape', () => {
    const onClose = vi.fn();
    const onCancel = vi.fn();
    function Stacked() {
      const [confirming] = useState(true);
      return (
        <Dialog open onClose={onClose} title="Run prompt">
          <textarea aria-label="Output" />
          <ConfirmDialog
            open={confirming}
            title="Discard the AI output?"
            message="The generated text hasn't been saved."
            confirmLabel="Discard"
            onConfirm={() => {}}
            onCancel={onCancel}
          />
        </Dialog>
      );
    }
    render(<Stacked />, { container: root });
    const confirm = screen.getByRole('dialog', { name: 'Discard the AI output?' });
    expect(confirm.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    // A key that somehow lands in the lower dialog is ignored while another is on top.
    fireEvent.keyDown(screen.getByLabelText('Output'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('returns focus inside the lower dialog when the top one closes', () => {
    function Stacked() {
      const [confirming, setConfirming] = useState(false);
      return (
        <Dialog open onClose={() => {}} title="Run prompt">
          <button type="button" onClick={() => setConfirming(true)}>Cancel run</button>
          <ConfirmDialog
            open={confirming}
            title="Discard?"
            message="Unsaved."
            confirmLabel="Discard"
            onConfirm={() => {}}
            onCancel={() => setConfirming(false)}
          />
        </Dialog>
      );
    }
    render(<Stacked />, { container: root });
    const opener = screen.getByRole('button', { name: 'Cancel run' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Discard?' })).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(root.hasAttribute('inert')).toBe(true);
  });
});
