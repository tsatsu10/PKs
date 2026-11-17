import { useMediaQuery } from '@mantine/hooks';
import { modKey } from '../../lib/keyboardMap';
import './Kbd.css';

export interface KbdProps {
  keys: string[];
}

/** Keyboard shortcut hint. Hidden on touch screens, where it can't be used. */
export default function Kbd({ keys }: KbdProps) {
  const coarse = useMediaQuery('(pointer: coarse)', false, { getInitialValueInEffect: false });
  if (coarse) return null;
  return (
    <span className="ui-kbd-group">
      {keys.map((k, i) => (
        <kbd key={`${k}-${i}`} className="ui-kbd">{k === 'mod' ? modKey : k}</kbd>
      ))}
    </span>
  );
}
