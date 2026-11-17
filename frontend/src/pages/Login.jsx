import { browserTimeZone } from '../lib/timezone';
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/errors';
import { fetchProfile } from '../data/profile';
import AuthLayout from '../components/AuthLayout';
import AuthField from '../components/auth/AuthField';
import PasswordInput from '../components/auth/PasswordInput';
import Turnstile from '../components/Turnstile';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const { user, login, clearSessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason');
  const sessionExpiredMessage = reason === 'session_expired';
  const formRef = useRef(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (sessionExpiredMessage && clearSessionExpired) clearSessionExpired();
  }, [sessionExpiredMessage, clearSessionExpired]);

  useEffect(() => {
    if (error && formRef.current) {
      const firstInvalid = formRef.current.querySelector('[aria-invalid="true"]');
      (firstInvalid || firstInputRef.current)?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (user) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true, state: {} });
    }
  }, [user, navigate, location.state?.from?.pathname]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken: captchaToken || undefined },
      });
      if (err) {
        const msg = getErrorMessage(err, 'Login failed');
        if (msg.toLowerCase().includes('email not confirmed')) {
          throw new Error('Please check your email and click the confirmation link before signing in.');
        }
        if (msg.toLowerCase().includes('invalid login')) {
          throw new Error('Invalid email or password. Please try again.');
        }
        throw new Error(msg);
      }
      if (!data?.user) throw new Error('Login failed');
      if (!data.session?.access_token) {
        throw new Error('Sign-in did not create a session. Please try again.');
      }

      const profileFetch = fetchProfile(data.user.id).catch(() => null);
      const profile = await Promise.race([
        profileFetch,
        new Promise((r) => setTimeout(() => r(null), 4000)),
      ]);

      const loggedIn = await login({
        id: data.user.id,
        email: data.user.email ?? profile?.email ?? email.trim(),
        displayName: profile?.display_name ?? '',
        timezone: profile?.timezone ?? browserTimeZone(),
        storedTimezone: profile?.timezone ?? null,
        createdAt: profile?.created_at ?? data.user.created_at,
      });
      if (!loggedIn) throw new Error('Sign-in did not create a session. Please try again.');
    } catch (err) {
      const msg = getErrorMessage(err, 'Login failed');
      setError(msg.toLowerCase().includes('captcha') ? 'Please complete the security check and try again.' : msg);
      setCaptchaToken('');
      setCaptchaKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const subtitle = sessionExpiredMessage
    ? 'Your session expired. Please sign in again.'
    : location.state?.from
      ? 'Please sign in to continue.'
      : 'Sign in to your knowledge base.';

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={subtitle}
      footer={
        <>
          New to PKS? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        aria-describedby={error ? 'login-error' : undefined}
        noValidate
      >
        {error && (
          <div id="login-error" className="auth-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        <AuthField id="login-email" label="Email" error={error || undefined}>
          <input
            ref={firstInputRef}
            id="login-email"
            type="email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            aria-invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </AuthField>
        <AuthField
          id="login-password"
          label="Password"
          trailing={
            <Link to="/forgot-password" className="auth-field-link">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            invalid={!!error}
          />
        </AuthField>
        <Turnstile key={captchaKey} siteKey={captchaSiteKey} onToken={setCaptchaToken} />
        <button
          type="submit"
          className="auth-button auth-button-primary"
          disabled={submitting || (captchaSiteKey && !captchaToken)}
          aria-busy={submitting}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
