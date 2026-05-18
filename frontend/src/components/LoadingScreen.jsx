/**
 * Full-screen loading state used by route lazy-load fallback and ProtectedRoute auth check.
 * Single source of truth for "app loading" UI.
 */
export default function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-label="Loading">
      <div className="loading-screen-logo-wrap">
        <img src="/pks-logo.svg" alt="" className="loading-screen-logo" width="64" height="64" />
      </div>
      <p className="loading-screen-text">Loading…</p>
    </div>
  );
}
