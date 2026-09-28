import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/errors';
import AuthLayout from '../components/AuthLayout';
import Turnstile from '../components/Turnstile';
import './Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
        captchaToken: captchaToken || undefined,
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to send reset email');
      setError(msg.toLowerCase().includes('captcha') ? 'Please complete the security check and try again.' : msg);
      setCaptchaToken('');
      setCaptchaKey((k) => k + 1);
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
        <Turnstile key={captchaKey} siteKey={captchaSiteKey} onToken={setCaptchaToken} />
        <button type="submit" disabled={submitting || (captchaSiteKey && !captchaToken)} aria-busy={submitting}>
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </AuthLayout>
  );
}
