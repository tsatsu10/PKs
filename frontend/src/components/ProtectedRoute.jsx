import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLayout from './AppLayout';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
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
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}
