/**
 * Small keyboard hint pill (e.g. Alt+1).
 */
export default function HotkeyHint({ keys }) {
  if (!keys?.length) return null;
  return (
    <kbd className="hotkey-hint" aria-hidden="true">
      {keys.join('')}
    </kbd>
  );
}
