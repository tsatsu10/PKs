import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmDialog from './ConfirmDialog';

function renderConfirm({ busy = false } = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Discard the AI output?"
      message="The generated text hasn't been saved."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      danger
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('focuses Cancel first', () => {
    renderConfirm();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep editing' }));
  });

  it('confirms and cancels', () => {
    const { onConfirm, onCancel } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(3);
  });
});

describe('ConfirmDialog description', () => {
  it('describes the dialog with its message', () => {
    renderConfirm();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription("The generated text hasn't been saved.");
  });
});

describe('ConfirmDialog busy', () => {
  it('ignores repeat clicks on Confirm while busy', () => {
    const { onConfirm } = renderConfirm({ busy: true });
    const confirm = screen.getByRole('button', { name: 'Discard' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
  });
});
