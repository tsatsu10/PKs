import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-page" role="main" id="main-content">
        <div className="auth-card">
          <h1>PKS</h1>
          <p className="auth-tagline">Second Brain for African Tech & Health</p>
          <h2>Check your email</h2>
          <p className="auth-hint">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your password.
          </p>
          <p className="auth-footer">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page" role="main" id="main-content">
      <div className="auth-card">
        <h1>PKS</h1>
        <p className="auth-tagline">Second Brain for African Tech & Health</p>
        <h2>Reset password</h2>
        <p className="auth-hint">Enter your email and we&apos;ll send you a link to set a new password.</p>
        <form className="form" onSubmit={handleSubmit} aria-describedby={error ? 'forgot-error' : undefined} noValidate>
          {error && (
            <div id="forgot-error" className="auth-error" role="alert" aria-live="assertive">
              {error}
            </div>
          )}
          <div className="form-floating">
            <input
              id="forgot-email"
              type="email"
              className="form-floating-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=" "
              required
              autoComplete="email"
              aria-invalid={!!error}
            />
            <label htmlFor="forgot-email" className="form-floating-label">Email</label>
          </div>
          <button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
