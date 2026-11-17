import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/errors';
import AuthLayout from '../components/AuthLayout';
import AuthField from '../components/auth/AuthField';
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

  return (
    <AuthLayout
      variant="card"
      title="Reset your password"
      subtitle="Enter your email and we'll send a reset link if an account exists."
    >
      <form
        onSubmit={handleSubmit}
        aria-describedby={error ? 'forgot-error' : undefined}
        noValidate
      >
        {error && (
          <div id="forgot-error" className="auth-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        {sent && (
          <p className="auth-success" role="status">
            If <strong>{email.trim()}</strong> has an account, a link is on its way. It works for 1
            hour.
          </p>
        )}
        <AuthField id="forgot-email" label="Email" error={error || undefined}>
          <input
            id="forgot-email"
            type="email"
            className="auth-input"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSent(false);
            }}
            autoComplete="email"
            required
            aria-invalid={!!error}
            aria-describedby={error ? 'forgot-error' : undefined}
          />
        </AuthField>
        <Turnstile key={captchaKey} siteKey={captchaSiteKey} onToken={setCaptchaToken} />
        <button
          type="submit"
          className="auth-button auth-button-primary"
          disabled={submitting || (captchaSiteKey && !captchaToken)}
          aria-busy={submitting}
        >
          {submitting ? 'Sending…' : sent ? 'Send another link' : 'Send reset link'}
        </button>
      </form>
      <div className="auth-footer">
        <Link to="/login">← Back to sign in</Link>
      </div>
    </AuthLayout>
  );
}
