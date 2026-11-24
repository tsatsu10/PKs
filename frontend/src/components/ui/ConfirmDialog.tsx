import { useId, useRef, type ReactNode } from 'react';
import Button from './Button';
import Dialog from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small Dialog asking one question. Cancel gets focus first, and every dismissal cancels. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const messageId = useId();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      describedBy={messageId}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div id={messageId}>{message}</div>
    </Dialog>
  );
}
