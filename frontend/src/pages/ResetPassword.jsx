import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AuthLayout from '../components/AuthLayout';
import './Auth.css';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState(null);
  const navigate = useNavigate();

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
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to update password'));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthLayout
        title="Password updated"
        hint="Your password has been set. Redirecting to dashboard…"
        footer={<Link to="/">Go to dashboard</Link>}
      >
        <p className="auth-message">You can sign in with your new password.</p>
      </AuthLayout>
    );
  }

  if (hasSession === false) {
    return (
      <AuthLayout
        title="Invalid or expired link"
        hint="This reset link is invalid or has expired. Request a new one below."
        footer={
          <>
            <Link to="/forgot-password">Send new reset link</Link>
            <span className="auth-footer-sep" aria-hidden>·</span>
            <Link to="/login">Sign in</Link>
          </>
        }
      >
        <p className="auth-message">Use the button above to request a fresh link, or sign in if you remember your password.</p>
      </AuthLayout>
    );
  }

  if (hasSession === null) {
    return (
      <AuthLayout title="Set new password" hint="Checking your link…">
        <div className="auth-loading-logo" aria-hidden>
          <img src="/pks-logo.svg" alt="" width="48" height="48" />
        </div>
        <p className="auth-message">Please wait…</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set new password"
      hint="Enter your new password below (min 8 characters)."
      footer={<Link to="/login">Back to sign in</Link>}
    >
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
    </AuthLayout>
  );
}
