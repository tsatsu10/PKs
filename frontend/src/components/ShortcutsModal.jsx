import { useEffect } from 'react';
import './ShortcutsModal.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS = [
  { keys: '/', description: 'Quick add (Dashboard) or focus search' },
  { keys: `${mod}+K`, description: 'Command palette' },
  { keys: `${mod}+N`, description: 'New object' },
  { keys: `${mod}+Shift+Q`, description: 'Quick capture' },
  { keys: `${mod}+Shift+R`, description: 'Run prompt (on object page)' },
  { keys: '?', description: 'Show this shortcuts help' },
  { keys: 'Esc', description: 'Close panel or modal' },
];

export default function ShortcutsModal({ open, onClose }) {
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

  return (
    <div className="shortcuts-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="shortcuts-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <ul className="shortcuts-modal-list">
          {SHORTCUTS.map(({ keys, description }) => (
            <li key={keys} className="shortcuts-modal-row">
              <kbd className="shortcuts-modal-keys">{keys}</kbd>
              <span className="shortcuts-modal-desc">{description}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
