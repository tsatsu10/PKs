import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, isPasswordRecovery, clearPasswordRecovery } from '../lib/supabase';
import { getErrorMessage } from '../lib/errors';
import AuthLayout from '../components/AuthLayout';
import AuthField from '../components/auth/AuthField';
import PasswordInput from '../components/auth/PasswordInput';
import PasswordStrength from '../components/auth/PasswordStrength';
import './Auth.css';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session?.user && isPasswordRecovery());
    }).catch(() => setHasSession(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setConfirmError('');
    if (password !== confirm) {
      setConfirmError('Passwords don\u2019t match.');
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
      clearPasswordRecovery();
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 2000);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update password'));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthLayout
        variant="card"
        title="Password updated"
        subtitle="You can sign in with your new password. Redirecting home…"
      >
        <div className="auth-footer">
          <Link to="/">Go to Home</Link>
        </div>
      </AuthLayout>
    );
  }

  if (hasSession === false) {
    return (
      <AuthLayout
        variant="card"
        title="Invalid or expired link"
        subtitle="This reset link is invalid or has expired. Request a new one below."
      >
        <p className="auth-message">
          Use the button below to request a fresh link, or sign in if you remember your password.
        </p>
        <div className="auth-footer">
          <Link to="/forgot-password">Send new reset link</Link>
          <span className="auth-footer-sep" aria-hidden>
            ·
          </span>
          <Link to="/login">Sign in</Link>
        </div>
      </AuthLayout>
    );
  }

  if (hasSession === null) {
    return (
      <AuthLayout variant="card" title="Choose a new password" subtitle="Checking your link…" />
    );
  }

  return (
    <AuthLayout
      variant="card"
      title="Choose a new password"
      subtitle="You'll be signed out on other devices."
    >
      <form onSubmit={handleSubmit} aria-describedby={error ? 'reset-error' : undefined} noValidate>
        {error && (
          <div id="reset-error" className="auth-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        <AuthField id="reset-password" label="New password">
          <PasswordInput
            id="reset-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            invalid={!!error}
          />
          <PasswordStrength password={password} />
        </AuthField>
        <AuthField id="reset-confirm" label="Confirm password" error={confirmError || undefined}>
          <PasswordInput
            id="reset-confirm"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (confirmError) setConfirmError('');
            }}
            autoComplete="new-password"
            required
            invalid={!!confirmError}
            describedBy={confirmError ? 'reset-confirm-error' : undefined}
          />
        </AuthField>
        <button
          type="submit"
          className="auth-button auth-button-primary"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? 'Saving…' : 'Save and sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
