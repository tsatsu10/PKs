import { Link } from 'react-router-dom';
import '../pages/Auth.css';

const HEADLINE = 'Capture in 2 seconds. Find anything instantly. Ask it with sources.';
const COPY =
  'Your personal knowledge system: notes and typed objects, linked together, searchable in milliseconds, with AI answers that cite your own notes.';

const CHIPS = [
  { title: 'Capture', detail: 'Ctrl+Shift+Q from anywhere' },
  { title: 'Link', detail: '[[' + ' to connect ideas' },
  { title: 'Ask', detail: 'Answers with citations' },
];

/**
 * Shared shell for auth pages.
 * variant="split" (default): full-height brand panel beside the form (desktop);
 * on mobile the brand collapses to logo + headline above the form.
 * variant="card": a single centered card on the app background (post-email states).
 */
export default function AuthLayout({ title, subtitle, footer, variant = 'split', children }) {
  return (
    <div className={`auth-page auth-page--${variant}`}>
      {variant === 'split' && (
        <aside className="auth-brand">
          <div className="auth-brand-top">
            <Link to="/" className="auth-brand-mark">
              <img src="/pks-logo.svg" alt="" className="auth-brand-logo" width="40" height="40" />
              <span className="auth-brand-name">PKS</span>
            </Link>
          </div>
          <div className="auth-brand-middle">
            <p className="auth-brand-headline">{HEADLINE}</p>
            <p className="auth-brand-copy">{COPY}</p>
            <ul className="auth-brand-chips">
              {CHIPS.map((chip) => (
                <li key={chip.title} className="auth-brand-chip">
                  <span className="auth-brand-chip-title">{chip.title}</span>
                  <span className="auth-brand-chip-detail">{chip.detail}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="auth-brand-footer">© PKS · Privacy · Terms</p>
        </aside>
      )}
      {variant === 'card' && (
        <Link to="/" className="auth-card-corner-mark">
          <img src="/pks-logo.svg" alt="PKS home" width="36" height="36" />
        </Link>
      )}
      <main className="auth-main" id="main-content" role="main">
        <div className={variant === 'card' ? 'auth-card' : 'auth-panel'}>
          {title && <h1 className="auth-title">{title}</h1>}
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
          {footer != null && <div className="auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
