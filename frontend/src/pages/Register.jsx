import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import './Auth.css';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (error && formRef.current) {
      const firstInvalid = formRef.current.querySelector('[aria-invalid="true"]');
      (firstInvalid || firstInputRef.current)?.focus();
    }
  }, [error]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim() || undefined, displayName: displayName.trim() || undefined },
        },
      });
      if (err) throw new Error(err.message);
      if (!data.user) throw new Error('Sign up failed');
      // Profile row is created by DB trigger; may need a moment
      const { data: profile } = await supabase
        .from('users')
        .select('email, display_name, timezone, created_at')
        .eq('id', data.user.id)
        .single();
      login({
        id: data.user.id,
        email: data.user.email ?? profile?.email ?? email.trim(),
        displayName: profile?.display_name ?? displayName.trim() ?? '',
        timezone: profile?.timezone ?? 'Africa/Accra',
        createdAt: profile?.created_at ?? data.user.created_at,
      });
      // Defer navigation so AuthContext state is committed before ProtectedRoute reads it
      setTimeout(() => navigate('/', { replace: true }), 50);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page" role="main" id="main-content">
      <div className="auth-card">
        <h1>PKS</h1>
        <p className="auth-tagline">Second Brain for African Tech & Health</p>
        <h2>Create account</h2>
        <form ref={formRef} className="form" onSubmit={handleSubmit} aria-describedby={error ? 'register-error' : undefined} noValidate>
          {error && (
            <div id="register-error" className="auth-error" role="alert" aria-live="assertive">
              {error}
            </div>
          )}
          <div className="form-floating">
            <input
              ref={firstInputRef}
              id="register-email"
              type="email"
              className="form-floating-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=" "
              required
              autoComplete="email"
              aria-invalid={!!error}
              aria-describedby={error ? 'register-error' : undefined}
            />
            <label htmlFor="register-email" className="form-floating-label">Email</label>
          </div>
          <div className="form-floating">
            <input
              id="register-display-name"
              type="text"
              className="form-floating-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder=" "
              autoComplete="name"
            />
            <label htmlFor="register-display-name" className="form-floating-label">Display name (optional)</label>
          </div>
          <div className="form-floating">
            <input
              id="register-password"
              type="password"
              className="form-floating-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=" "
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={!!error}
              aria-describedby="register-password-hint"
            />
            <label htmlFor="register-password" className="form-floating-label">Password (min 8 characters)</label>
            <p className="field-hint" id="register-password-hint">Use at least 8 characters.</p>
          </div>
          <button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
