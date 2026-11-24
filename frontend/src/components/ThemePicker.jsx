import { useTheme } from '../context/ThemeContext';
import Button from './ui/Button';

const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

/** Light / dark / system. The chosen one is pressed, so the state isn't colour alone (A15). */
export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="settings-theme-toggle" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <Button key={t.value} variant={theme === t.value ? 'primary' : 'secondary'} aria-pressed={theme === t.value} onClick={() => setTheme(t.value)}>
          {t.label}
        </Button>
      ))}
    </div>
  );
}
