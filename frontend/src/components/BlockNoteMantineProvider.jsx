import { MantineProvider } from '@mantine/core';

/** Mantine context required by @blocknote/mantine — scoped to editor routes only. */
export default function BlockNoteMantineProvider({ children }) {
  return (
    <MantineProvider defaultColorScheme="dark" theme={{ primaryColor: 'pink' }}>
      {children}
    </MantineProvider>
  );
}
