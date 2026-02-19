import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AuthLayout from '../components/AuthLayout';
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
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to send reset email'));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        hint={
          <>
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your password.
          </>
        }
        footer={<Link to="/login">Back to sign in</Link>}
      >
        <p className="auth-message">Check your inbox and spam folder. The link will expire in an hour.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset password"
      hint="Enter your email and we'll send you a link to set a new password."
      footer={<Link to="/login">Back to sign in</Link>}
    >
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
    </AuthLayout>
  );
}
