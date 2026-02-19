import { Link } from 'react-router-dom';
import '../pages/Auth.css';

/**
 * Shared shell for auth pages: brand block (left on desktop) + card (right).
 */
export default function AuthLayout({ title, hint, footer, children }) {
  return (
    <div className="auth-page" role="main" id="main-content">
      <div className="auth-layout">
        <aside className="auth-brand" aria-hidden="true">
          <Link to="/" className="auth-brand-inner">
            <img src="/pks-logo.svg" alt="" className="auth-brand-logo" width="56" height="56" />
            <span className="auth-brand-name">PKS</span>
            <span className="auth-brand-full">Personal Knowledge System</span>
            <span className="auth-brand-tagline">Your second brain for knowledge</span>
            <span className="auth-brand-copy">Capture, connect, and reuse what you learn.</span>
          </Link>
        </aside>
        <main className="auth-main">
          <div className="auth-card">
            <h2 className="auth-card-title">{title}</h2>
            {hint && <p className="auth-hint">{hint}</p>}
            {children}
            {footer != null && <div className="auth-footer">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
