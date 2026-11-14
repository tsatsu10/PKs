import { MantineProvider } from '@mantine/core';
import { useTheme } from '../context/ThemeContext';

/** Module-level so MantineProvider gets the same theme object on every render. */
const MANTINE_THEME = { primaryColor: 'pink' };

/** Mantine context required by @blocknote/mantine — scoped to editor routes only. */
export default function BlockNoteMantineProvider({ children }) {
  const { resolvedTheme } = useTheme();
  return (
    <MantineProvider forceColorScheme={resolvedTheme} theme={MANTINE_THEME}>
      {children}
    </MantineProvider>
  );
}
