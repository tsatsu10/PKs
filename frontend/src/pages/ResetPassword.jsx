import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Auth.css';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState(null);
  const navigate = useNavigate();

  // After redirect from email link, session is in URL hash; Supabase parses it on getSession()
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session?.user);
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 2000);
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="auth-page" role="main" id="main-content">
        <div className="auth-card">
          <h1>PKS</h1>
          <p className="auth-tagline">Second Brain for African Tech & Health</p>
          <h2>Password updated</h2>
          <p className="auth-hint">Your password has been set. Redirecting to dashboard…</p>
          <p className="auth-footer">
            <Link to="/">Go to dashboard</Link>
          </p>
        </div>
      </div>
    );
  }

  if (hasSession === false) {
    return (
      <div className="auth-page" role="main" id="main-content">
        <div className="auth-card">
          <h1>PKS</h1>
          <p className="auth-tagline">Second Brain for African Tech & Health</p>
          <h2>Invalid or expired link</h2>
          <p className="auth-hint">This reset link is invalid or has expired. Request a new one below.</p>
          <p className="auth-footer">
            <Link to="/forgot-password">Send new reset link</Link>
            {' · '}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  if (hasSession === null) {
    return (
      <div className="auth-page" role="main" id="main-content">
        <div className="auth-card">
          <h1>PKS</h1>
          <p className="auth-tagline">Second Brain for African Tech & Health</p>
          <h2>Set new password</h2>
          <p className="auth-hint" aria-live="polite">Checking your link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page" role="main" id="main-content">
      <div className="auth-card">
        <h1>PKS</h1>
        <p className="auth-tagline">Second Brain for African Tech & Health</p>
        <h2>Set new password</h2>
        <p className="auth-hint">Enter your new password below (min 8 characters).</p>
        <form className="form" onSubmit={handleSubmit} aria-describedby={error ? 'reset-error' : undefined} noValidate>
          {error && (
            <div id="reset-error" className="auth-error" role="alert" aria-live="assertive">
              {error}
            </div>
          )}
          <div className="form-floating">
            <input
              id="reset-password"
              type="password"
              className="form-floating-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=" "
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={!!error}
            />
            <label htmlFor="reset-password" className="form-floating-label">New password (min 8 characters)</label>
          </div>
          <div className="form-floating">
            <input
              id="reset-confirm"
              type="password"
              className="form-floating-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder=" "
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={!!error}
            />
            <label htmlFor="reset-confirm" className="form-floating-label">Confirm password</label>
          </div>
          <button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Updating…' : 'Set password'}
          </button>
        </form>
        <p className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
