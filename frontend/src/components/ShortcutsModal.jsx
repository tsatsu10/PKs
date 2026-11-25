import { getAllShortcutRows } from '../lib/keyboardMap';
import Dialog from './ui/Dialog';
import './ui/Kbd.css';
import './ShortcutsModal.css';

/** The keyboard shortcuts reference, opened with `?`. */
export default function ShortcutsModal({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <ul className="shortcuts-modal-list">
        {getAllShortcutRows().map(({ keys, description }) => (
          <li key={keys + description} className="shortcuts-modal-row">
            <kbd className="ui-kbd">{keys}</kbd>
            <span>{description}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
