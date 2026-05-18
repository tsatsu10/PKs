import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from './LoadingScreen';

/** Auth gate only — layout shell is provided by AppShell via nested routes. */
export default function ProtectedRoute({ children }) {
  const { user, hasValidSession, loading, sessionExpired } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!user || !hasValidSession) {
    const to = sessionExpired
      ? { pathname: '/login', search: '?reason=session_expired', state: { from: location } }
      : { pathname: '/login', state: { from: location } };
    return <Navigate to={to} replace />;
  }

  return children;
}
