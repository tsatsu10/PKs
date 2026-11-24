import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Breadcrumbs from '../components/Breadcrumbs';
import Turnstile from '../components/Turnstile';
import { useAuth } from '../context/AuthContext';
import { AI_PROVIDERS, DEFAULT_AI_PROVIDER, aiProviderLabel } from '../constants';
import { validateApiKeyForProvider } from '../lib/aiProviders';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../components/ui/Toaster';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/errors';
import { useNotifyError } from '../lib/useNotifyError';
import { reportError } from '../lib/reportError';
import { createDomain, createTag } from '../lib/entities';
import { getExportIncludeFromTemplate, buildObjectMarkdown } from '../lib/export';
import { downloadBlob } from '../lib/download';
import QueryError from '../components/QueryError';
import TimezoneSuggestion from '../components/TimezoneSuggestion';
import { browserTimeZone } from '../lib/timezone';
import { useTaxonomy, upsertTaxonomyEntity, removeTaxonomyEntity, invalidateTaxonomy } from '../data/taxonomy';
import { useAiProviders, invalidateAiProviders } from '../data/settings';
import { fetchOwnObjectsForExport, fetchAccountExtras } from '../data/exports';
import './Settings.css';

export default function Settings() {
  const { user, refreshUser, profileLoaded } = useAuth();
  const { theme, setTheme } = useTheme();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const notifyError = useNotifyError();
  const taxonomy = useTaxonomy(user?.id ?? null);
  const { domains, tags } = taxonomy;
  const providersQ = useAiProviders(user?.id ?? null);
  const aiProviders = useMemo(() => providersQ.data ?? [], [providersQ.data]);
  const loading = providersQ.isPending;
  const [newDomain, setNewDomain] = useState('');
  const [newTag, setNewTag] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [aiProviderName, setAiProviderName] = useState('');
  const [aiProviderKey, setAiProviderKey] = useState('');
  const [aiProviderType, setAiProviderType] = useState(DEFAULT_AI_PROVIDER);
  const [addingAiProvider, setAddingAiProvider] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) setInstalled(true);
  }, []);

  async function handleInstallClick() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  }

  // Fill the profile form once per user, and again when the stored profile
  // arrives, never on other user-object changes (a refocus re-verify would
  // otherwise wipe in-progress edits). Adjusting state during render, per React docs.
  const profileFormKey = user?.id ? `${user.id}:${profileLoaded ? 'loaded' : 'pending'}` : null;
  const [profileFormFor, setProfileFormFor] = useState(null);
  if (profileFormKey && profileFormKey !== profileFormFor) {
    setProfileFormFor(profileFormKey);
    setProfileDisplayName(user.displayName ?? '');
    setProfileTimezone(user.timezone ?? browserTimeZone());
  }

  async function saveProfile(e) {
    e.preventDefault();
    // Until the profile loads the form holds defaults (the browser's zone); saving
    // them would overwrite the stored timezone and display name.
    if (!profileLoaded) return;
    setProfileError('');
    setProfileSaving(true);
    try {
      const { error: err } = await supabase
        .from('users')
        .update({
          display_name: profileDisplayName.trim() || null,
          timezone: profileTimezone.trim() || browserTimeZone(),
        })
        .eq('id', user.id);
      if (err) throw err;
      await refreshUser();
      addToast('success', 'Profile updated');
    } catch (err) {
      setProfileError(getErrorMessage(err, 'Failed to update profile'));
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    const email = user?.email;
    if (!email) {
      setPasswordError('Email not found. Sign out and sign in again.');
      return;
    }
    setPasswordSaving(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
        options: { captchaToken: captchaToken || undefined },
      });
      if (signInErr) {
        const msg = signInErr.message ?? 'Verification failed';
        if (msg.toLowerCase().includes('captcha')) {
          setPasswordError('Please complete the security check and try again.');
        } else if (msg.toLowerCase().includes('invalid')) {
          setPasswordError('Current password is incorrect');
        } else {
          setPasswordError(msg);
        }
        setCaptchaToken('');
        setCaptchaKey((k) => k + 1);
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast('success', 'Password updated');
    } catch (err) {
      setPasswordError(getErrorMessage(err, 'Failed to update password'));
      setCaptchaToken('');
      setCaptchaKey((k) => k + 1);
    } finally {
      setPasswordSaving(false);
    }
  }

  async function addDomain(e) {
    e.preventDefault();
    const name = newDomain.trim();
    if (!name) return;
    setError('');
    setAddingDomain(true);
    try {
      const domain = await createDomain(name);
      setNewDomain('');
      if (domains.some((d) => d.id === domain.id)) {
        addToast('info', `Domain "${domain.name}" already exists`);
      } else {
        upsertTaxonomyEntity('domains', domain, queryClient);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add domain'));
    } finally {
      setAddingDomain(false);
    }
  }

  async function addTag(e) {
    e.preventDefault();
    const name = newTag.trim();
    if (!name) return;
    setError('');
    setAddingTag(true);
    try {
      const tag = await createTag(name);
      setNewTag('');
      if (tags.some((t) => t.id === tag.id)) {
        addToast('info', `Tag "${tag.name}" already exists`);
      } else {
        upsertTaxonomyEntity('tags', tag, queryClient);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add tag'));
    } finally {
      setAddingTag(false);
    }
  }

  async function deleteDomain(id) {
    setError('');
    setDeletingId(id);
    try {
      await supabase.from('knowledge_object_domains').delete().eq('domain_id', id);
      const { error: err } = await supabase.from('domains').delete().eq('id', id).eq('user_id', user.id);
      if (err) throw err;
      removeTaxonomyEntity('domains', id, queryClient);
      await invalidateTaxonomy(queryClient);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete domain'));
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteTag(id) {
    setError('');
    setDeletingId(id);
    try {
      await supabase.from('knowledge_object_tags').delete().eq('tag_id', id);
      const { error: err } = await supabase.from('tags').delete().eq('id', id).eq('user_id', user.id);
      if (err) throw err;
      removeTaxonomyEntity('tags', id, queryClient);
      await invalidateTaxonomy(queryClient);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete tag'));
    } finally {
      setDeletingId(null);
    }
  }

  async function addAiProvider(e) {
    e.preventDefault();
    const name = aiProviderName.trim();
    const keyCheck = validateApiKeyForProvider(aiProviderType, aiProviderKey);
    if (!name) return;
    if (!keyCheck.ok) {
      setError(keyCheck.message);
      return;
    }
    setError('');
    setAddingAiProvider(true);
    try {
      const { error: err } = await supabase.from('user_ai_providers').insert({
        user_id: user.id,
        name,
        provider_type: aiProviderType,
        api_key: keyCheck.key,
      });
      if (err) throw err;
      setAiProviderName('');
      setAiProviderKey('');
      await invalidateAiProviders(queryClient);
    } catch (err) {
      setError(notifyError(err, 'Failed to add AI provider'));
    } finally {
      setAddingAiProvider(false);
    }
  }

  async function deleteAiProvider(id) {
    setError('');
    setDeletingId(id);
    try {
      const { error: err } = await supabase.from('user_ai_providers').delete().eq('id', id).eq('user_id', user.id);
      if (err) throw err;
      await invalidateAiProviders(queryClient);
    } catch (err) {
      setError(notifyError(err, 'Failed to remove AI provider'));
    } finally {
      setDeletingId(null);
    }
  }

  /** Full account export: objects, journal, paste bin, domains, tags as one JSON. */
  async function downloadFullAccountData() {
    setBackupError('');
    setBackupLoading(true);
    try {
      const [objects, extras] = await Promise.all([
        fetchOwnObjectsForExport(user.id),
        fetchAccountExtras(user.id),
      ]);
      const exported_at = new Date().toISOString();
      const journal_entries = extras.journal_entries;
      const paste_bin = extras.paste_bin;
      const domains = extras.domains;
      const tags = extras.tags;
      const CHUNK = 50;
      const parts = [
        '{"exported_at":"', exported_at, '","version":1,"objects":[',
      ];
      for (let i = 0; i < objects.length; i += CHUNK) {
        const chunk = objects.slice(i, i + CHUNK);
        chunk.forEach((o, j) => {
          if (i + j > 0) parts.push(',');
          parts.push(JSON.stringify(o, null, 2));
        });
        if (i + CHUNK < objects.length) await new Promise((r) => setTimeout(r, 0));
      }
      parts.push(
        '],"journal_entries":', JSON.stringify(journal_entries, null, 2),
        ',"paste_bin":', JSON.stringify(paste_bin, null, 2),
        ',"domains":', JSON.stringify(domains, null, 2),
        ',"tags":', JSON.stringify(tags, null, 2),
        '}',
      );
      const blob = new Blob([parts.join('')], { type: 'application/json' });
      downloadBlob(blob, `pks-my-data-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      reportError(err);
      setBackupError(getErrorMessage(err, 'Export failed'));
    } finally {
      setBackupLoading(false);
    }
  }

  async function downloadBackupJson() {
    setBackupError('');
    setBackupLoading(true);
    try {
      const normalized = await fetchOwnObjectsForExport(user.id);
      const exported_at = new Date().toISOString();
      const CHUNK = 50;
      const parts = ['{"exported_at":"', exported_at, '","objects":['];
      for (let i = 0; i < normalized.length; i += CHUNK) {
        const chunk = normalized.slice(i, i + CHUNK);
        chunk.forEach((o, j) => {
          if (i + j > 0) parts.push(',');
          parts.push(JSON.stringify(o, null, 2));
        });
        if (i + CHUNK < normalized.length) await new Promise((r) => setTimeout(r, 0));
      }
      parts.push(']}');
      const blob = new Blob([parts.join('')], { type: 'application/json' });
      downloadBlob(blob, `pks-backup-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      reportError(err);
      setBackupError(getErrorMessage(err, 'Export failed'));
    } finally {
      setBackupLoading(false);
    }
  }

  async function downloadBackupMarkdownZip() {
    setBackupError('');
    setBackupLoading(true);
    try {
      const objs = await fetchOwnObjectsForExport(user.id);
      const include = getExportIncludeFromTemplate('full', { includeLinks: false });
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      objs.forEach((o, i) => {
        const md = buildObjectMarkdown(o, include);
        const safeTitle = (o.title || 'untitled').replace(/[<>:"/\\|?*]/g, '_').slice(0, 80);
        zip.file(`${String(i + 1).padStart(3, '0')}-${safeTitle}.md`, md);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `pks-backup-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (err) {
      reportError(err);
      setBackupError(getErrorMessage(err, 'Export failed'));
    } finally {
      setBackupLoading(false);
    }
  }

  if (loading) return <div className="settings-page"><p role="status" aria-live="polite">Loading…</p></div>;

  return (
    <div className="settings-page">
      <header className="settings-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Settings' }]} />
        <h1>Settings</h1>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="settings-section page-section" aria-labelledby="account-heading">
        <h2 id="account-heading" className="page-section-title">Account</h2>
        <p className="settings-desc page-section-desc">Your display name and timezone. Used across the app for dates and identification.</p>
        {profileError && <div className="form-error" role="alert">{profileError}</div>}
        <form onSubmit={saveProfile} className="settings-form form">
          <label>
            Email
            <input type="text" value={user?.email ?? ''} readOnly disabled className="settings-input-readonly" aria-describedby="account-email-hint" />
            <span id="account-email-hint" className="settings-desc">Email cannot be changed here. Use your auth provider or contact support.</span>
          </label>
          <label>
            Display name
            <input
              type="text"
              value={profileDisplayName}
              onChange={(e) => setProfileDisplayName(e.target.value)}
              placeholder="Your name"
              disabled={profileSaving}
              aria-label="Display name"
            />
          </label>
          <label>
            Timezone
            <input
              type="text"
              value={profileTimezone}
              onChange={(e) => setProfileTimezone(e.target.value)}
              placeholder="e.g. Africa/Accra, America/New_York"
              disabled={profileSaving}
              aria-label="Timezone"
              list="timezone-suggestions"
            />
            <datalist id="timezone-suggestions">
              <option value="Africa/Accra" />
              <option value="America/New_York" />
              <option value="America/Los_Angeles" />
              <option value="Europe/London" />
              <option value="Europe/Paris" />
              <option value="Asia/Tokyo" />
              <option value="UTC" />
            </datalist>
          </label>
          {profileLoaded && <TimezoneSuggestion stored={user?.storedTimezone} value={profileTimezone.trim()} onUse={setProfileTimezone} />}
          {!profileLoaded && (
            <p id="profile-loading-hint" className="settings-desc" role="status">
              Loading your saved profile… You can save once it has loaded.
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={profileSaving || !profileLoaded}
            aria-describedby={profileLoaded ? undefined : 'profile-loading-hint'}
          >
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      <section className="settings-section page-section" aria-labelledby="password-heading">
        <h2 id="password-heading" className="page-section-title">Change password</h2>
        <p className="settings-desc page-section-desc">Enter your current password, then choose a new one (min 8 characters).</p>
        {passwordError && <div className="form-error" role="alert">{passwordError}</div>}
        {passwordSuccess && <p className="settings-muted" role="status">Password updated. You can sign in with the new password next time.</p>}
        <form onSubmit={changePassword} className="settings-form form">
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              disabled={passwordSaving}
              autoComplete="current-password"
              aria-label="Current password"
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              disabled={passwordSaving}
              minLength={8}
              autoComplete="new-password"
              aria-label="New password"
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={passwordSaving}
              minLength={8}
              autoComplete="new-password"
              aria-label="Confirm new password"
            />
          </label>
          <Turnstile key={captchaKey} siteKey={captchaSiteKey} onToken={setCaptchaToken} />
          <button type="submit" className="btn btn-primary" disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword || (captchaSiteKey && !captchaToken)}>
            {passwordSaving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>

      <section className="settings-section page-section">
        <h2 className="page-section-title">Appearance</h2>
        <p className="settings-desc page-section-desc">Choose light, dark, or system theme.</p>
        <div className="settings-theme-toggle" role="group" aria-label="Theme">
          <button type="button" className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTheme('dark')}>Dark</button>
          <button type="button" className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTheme('light')}>Light</button>
          <button type="button" className={`btn ${theme === 'system' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTheme('system')}>System</button>
        </div>
      </section>

      <section className="settings-section page-section">
        <h2 className="page-section-title">AI API keys</h2>
        <p className="settings-desc page-section-desc">Add your own DeepSeek or Claude API key and give it a name. You can then choose it in the Run prompt dropdown instead of the server default. Keys are write-only: they can't be read back, only removed.</p>
        <form onSubmit={addAiProvider} className="settings-form form">
          <select
            value={aiProviderType}
            onChange={(e) => setAiProviderType(e.target.value)}
            disabled={addingAiProvider}
            aria-label="Provider"
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={aiProviderName}
            onChange={(e) => setAiProviderName(e.target.value)}
            placeholder={`e.g. My ${aiProviderLabel(aiProviderType)}`}
            disabled={addingAiProvider}
            aria-label="Provider name"
          />
          <input
            type="password"
            value={aiProviderKey}
            onChange={(e) => setAiProviderKey(e.target.value)}
            placeholder={AI_PROVIDERS.find((p) => p.id === aiProviderType)?.keyPlaceholder}
            disabled={addingAiProvider}
            autoComplete="off"
            aria-label="API key"
          />
          <button type="submit" className="btn btn-primary" disabled={addingAiProvider || !aiProviderName.trim() || !aiProviderKey.trim()}>
            {addingAiProvider ? 'Adding…' : 'Add'}
          </button>
        </form>
        <ul className="settings-list">
          {aiProviders.map((p) => (
            <li key={p.id}>
              <span><strong>{p.name}</strong> ({aiProviderLabel(p.provider_type)})</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => deleteAiProvider(p.id)}
                disabled={deletingId === p.id}
              >
                {deletingId === p.id ? '…' : 'Remove'}
              </button>
            </li>
          ))}
          {aiProviders.length === 0 && <li className="muted">No custom AI providers yet.</li>}
        </ul>
      </section>

      <section className="settings-section page-section">
        <h2 className="page-section-title">Domains</h2>
        <p className="settings-desc page-section-desc">Domains group your knowledge by area (e.g. Health, Tech, Projects).</p>
        {taxonomy.error && <QueryError what="domains and tags" error={taxonomy.error} onRetry={taxonomy.refetch} />}
        <form onSubmit={addDomain} className="settings-form form">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="New domain name"
            disabled={addingDomain}
          />
          <button type="submit" className="btn btn-primary" disabled={addingDomain || !newDomain.trim()}>
            {addingDomain ? 'Adding…' : 'Add'}
          </button>
        </form>
        <ul className="settings-list">
          {domains.map((d) => (
            <li key={d.id}>
              <span>{d.name}</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => deleteDomain(d.id)}
                disabled={deletingId === d.id}
              >
                {deletingId === d.id ? '…' : 'Remove'}
              </button>
            </li>
          ))}
          {domains.length === 0 && <li className="muted">No domains yet.</li>}
        </ul>
      </section>

      <section className="settings-section page-section">
        <h2 className="page-section-title">Install app</h2>
        <p className="settings-desc page-section-desc">Install PKS on your device for quick access. The app caches assets for faster loads and basic offline support when installed.</p>
        {installPrompt && !installed && (
          <button type="button" className="btn btn-primary" onClick={handleInstallClick}>
            Install PKS app
          </button>
        )}
        {installed && <p className="settings-muted">PKS is installed.</p>}
        {!installPrompt && !installed && <p className="settings-muted">Install prompt not available (e.g. already installed or not supported).</p>}
      </section>

      <section className="settings-section page-section">
        <h2 className="page-section-title">Export &amp; backup</h2>
        <p className="settings-desc page-section-desc">Download your data as a portable backup. &quot;Download my data&quot; includes knowledge objects, journal entries, paste bin, domains, and tags in one JSON file.</p>
        {backupError && <div className="form-error" role="alert">{backupError}</div>}
        <div className="settings-form settings-form-actions">
          <button type="button" className="btn btn-primary" onClick={downloadFullAccountData} disabled={backupLoading}>
            {backupLoading ? 'Preparing…' : 'Download my data (full JSON)'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={downloadBackupJson} disabled={backupLoading}>
            {backupLoading ? 'Preparing…' : 'Objects only (JSON)'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={downloadBackupMarkdownZip} disabled={backupLoading}>
            {backupLoading ? 'Preparing…' : 'Objects as Markdown (ZIP)'}
          </button>
        </div>
      </section>

      <section className="settings-section page-section">
        <h2 className="page-section-title">Tags</h2>
        <p className="settings-desc page-section-desc">Tags are labels you can attach to any object (e.g. urgent, draft).</p>
        <form onSubmit={addTag} className="settings-form form">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="New tag name"
            disabled={addingTag}
          />
          <button type="submit" className="btn btn-primary" disabled={addingTag || !newTag.trim()}>
            {addingTag ? 'Adding…' : 'Add'}
          </button>
        </form>
        <ul className="settings-list">
          {tags.map((t) => (
            <li key={t.id}>
              <span>{t.name}</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => deleteTag(t.id)}
                disabled={deletingId === t.id}
              >
                {deletingId === t.id ? '…' : 'Remove'}
              </button>
            </li>
          ))}
          {tags.length === 0 && <li className="muted">No tags yet.</li>}
        </ul>
      </section>
    </div>
  );
}
