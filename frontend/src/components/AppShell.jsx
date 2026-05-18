import { Outlet } from 'react-router-dom';
import AppLayout from './AppLayout';
import { DeckProvider } from './MainMenuDeckContext';

/** Persistent app chrome for all authenticated routes (sidebar, deck, notifications). */
export default function AppShell() {
  return (
    <DeckProvider>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </DeckProvider>
  );
}
