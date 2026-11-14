import type { useShares, ShareRole } from './hooks/useShares';

/** Share panel: add a share by email, list shares and pending invites, revoke. */
export default function SharePanel({ shares, onClose }: { shares: ReturnType<typeof useShares>; onClose: () => void }) {
  const { shares: rows, email, setEmail, role, setRole, sharing, add, revoke } = shares;
  return (
    <section className="share-panel">
      <h2>Share object</h2>
      <form onSubmit={add} className="share-form">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="collaborator@example.com"
            required
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
            <option value="viewer">Viewer (read only)</option>
            <option value="editor">Editor (can edit content)</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={sharing}>
          {sharing ? 'Adding…' : 'Add'}
        </button>
      </form>
      <h3>Shared with</h3>
      {rows.length === 0 ? (
        <p className="share-empty">Not shared with anyone yet.</p>
      ) : (
        <ul className="share-list">
          {rows.map((s) => (
            <li key={s.id}>
              <span className="share-email">{s.shared_with_email || '—'}</span>
              {s.pending && <span className="muted"> · pending</span>}
              <span className="share-role">{s.role}</span>
              <button type="button" className="btn btn-danger btn-small" onClick={() => revoke(s.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="share-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
