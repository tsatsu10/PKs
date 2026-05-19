import { useEffect, useRef } from 'react';
import { useFocusTrap } from '@mantine/hooks';
import { getAllShortcutRows } from '../features/dashboard/lib/keyboardMap';
import './ShortcutsModal.css';

export default function ShortcutsModal({ open, onClose }) {
  const prevFocusRef = useRef(/** @type {HTMLElement | null} */ (null));
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else {
      const prev = prevFocusRef.current;
      prevFocusRef.current = null;
      if (prev && typeof prev.focus === 'function') prev.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const shortcuts = getAllShortcutRows();

  return (
    <div className="shortcuts-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div ref={focusTrapRef} className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="shortcuts-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <ul className="shortcuts-modal-list">
          {shortcuts.map(({ keys, description }) => (
            <li key={keys + description} className="shortcuts-modal-row">
              <kbd className="shortcuts-modal-keys">{keys}</kbd>
              <span className="shortcuts-modal-desc">{description}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
