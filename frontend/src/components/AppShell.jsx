import { Outlet } from 'react-router-dom';
import AppLayout from './AppLayout';

/** Persistent app chrome for all authenticated routes (sidebar, notifications). */
export default function AppShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
