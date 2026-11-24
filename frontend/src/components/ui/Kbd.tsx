import { useMediaQuery } from '@mantine/hooks';
import { altKey, modKey } from '../../lib/keyboardMap';

const PLATFORM_KEYS: Record<string, string> = { mod: modKey, alt: altKey };
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
        <kbd key={`${k}-${i}`} className="ui-kbd">{PLATFORM_KEYS[k] ?? k}</kbd>
      ))}
    </span>
  );
}
