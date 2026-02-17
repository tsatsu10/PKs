import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (error && formRef.current) {
      const firstInvalid = formRef.current.querySelector('[aria-invalid="true"]');
      (firstInvalid || firstInputRef.current)?.focus();
    }
  }, [error]);

  // If already logged in, go to dashboard (or the page they tried to open)
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
      });
      if (err) {
        const msg = err.message || 'Login failed';
        if (msg.toLowerCase().includes('email not confirmed')) {
          throw new Error('Please check your email and click the confirmation link before signing in.');
        }
        if (msg.toLowerCase().includes('invalid login')) {
          throw new Error('Invalid email or password. Please try again.');
        }
        throw new Error(msg);
      }
      if (!data?.user) throw new Error('Login failed');

      const profileFetch = supabase
        .from('users')
        .select('email, display_name, timezone, created_at')
        .eq('id', data.user.id)
        .single()
        .then((r) => (r.error ? null : r.data))
        .catch(() => null);
      const profile = await Promise.race([
        profileFetch,
        new Promise((r) => setTimeout(() => r(null), 4000)),
      ]);

      login({
        id: data.user.id,
        email: data.user.email ?? profile?.email ?? email.trim(),
        displayName: profile?.display_name ?? '',
        timezone: profile?.timezone ?? 'Africa/Accra',
        createdAt: profile?.created_at ?? data.user.created_at,
      });
      // Defer navigation so AuthContext state is committed before ProtectedRoute reads it
      setTimeout(() => navigate('/', { replace: true }), 50);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page" role="main" id="main-content">
      <div className="auth-card">
        <h1>PKS</h1>
        <p className="auth-tagline">Second Brain for African Tech & Health</p>
        <h2>Sign in</h2>
        {location.state?.from && (
          <p className="auth-hint">Please sign in to continue.</p>
        )}
        <form ref={formRef} className="form" onSubmit={handleSubmit} aria-describedby={error ? 'login-error' : undefined} noValidate>
          {error && (
            <div id="login-error" className="auth-error" role="alert" aria-live="assertive">
              {error}
            </div>
          )}
          <div className="form-floating">
            <input
              ref={firstInputRef}
              id="login-email"
              type="email"
              className="form-floating-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=" "
              required
              autoComplete="email"
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : undefined}
            />
            <label htmlFor="login-email" className="form-floating-label">Email</label>
          </div>
          <div className="form-floating">
            <input
              id="login-password"
              type="password"
              className="form-floating-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=" "
              required
              autoComplete="current-password"
              aria-invalid={!!error}
            />
            <label htmlFor="login-password" className="form-floating-label">Password</label>
          </div>
          <button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="auth-footer">
          <Link to="/forgot-password">Forgot password?</Link>
          {' · '}
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
