import { createContext, useContext, useState, useEffect } from 'react';

const THEME_KEY = 'pks-theme';

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const ThemeContext = createContext({ theme: 'dark', resolvedTheme: 'dark', setTheme: () => {}, cycleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
    } catch {
      return 'system';
    }
  });

  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => setSystemTheme(getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {}
  }, [theme, resolvedTheme]);

  const setTheme = (value) => {
    if (value === 'light' || value === 'dark' || value === 'system') {
      setThemeState(value);
    } else {
      setThemeState('dark');
    }
  };

  const cycleTheme = () => {
    setThemeState((prev) => {
      const effective = prev === 'system' ? systemTheme : prev;
      return effective === 'dark' ? 'light' : 'dark';
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
