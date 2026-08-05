import { MantineProvider } from '@mantine/core';
import { useTheme } from '../context/ThemeContext';

/** Mantine context required by @blocknote/mantine — scoped to editor routes only. */
export default function BlockNoteMantineProvider({ children }) {
  const { resolvedTheme } = useTheme();
  return (
    <MantineProvider forceColorScheme={resolvedTheme} theme={{ primaryColor: 'pink' }}>
      {children}
    </MantineProvider>
  );
}
