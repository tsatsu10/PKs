import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLayout from './AppLayout';
import { DeckProvider } from './MainMenuDeck';

export default function ProtectedRoute({ children }) {
  const { user, loading, sessionExpired } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite" aria-label="Loading">
        <div className="loading-screen-logo-wrap">
          <img src="/pks-logo.svg" alt="" className="loading-screen-logo" width="64" height="64" />
        </div>
        <p className="loading-screen-text">Loading…</p>
      </div>
    );
  }

  if (!user) {
    const to = sessionExpired
      ? { pathname: '/login', search: '?reason=session_expired', state: { from: location } }
      : { pathname: '/login', state: { from: location } };
    return <Navigate to={to} replace />;
  }

  return (
    <DeckProvider>
      <AppLayout>{children}</AppLayout>
    </DeckProvider>
  );
}
