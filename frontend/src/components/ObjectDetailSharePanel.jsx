/**
 * Share panel for ObjectDetail: add share by email, list shares, revoke.
 */
export default function ObjectDetailSharePanel({
  shares,
  shareEmail,
  setShareEmail,
  shareRole,
  setShareRole,
  sharing,
  onAddShare,
  onRevokeShare,
  onClose,
}) {
  return (
    <section className="share-panel">
      <h2>Share object</h2>
      <form onSubmit={onAddShare} className="share-form">
        <label>
          Email
          <input
            type="email"
            value={shareEmail}
            onChange={(e) => setShareEmail(e.target.value)}
            placeholder="collaborator@example.com"
            required
          />
        </label>
        <label>
          Role
          <select value={shareRole} onChange={(e) => setShareRole(e.target.value)}>
            <option value="viewer">Viewer (read only)</option>
            <option value="editor">Editor (can edit content)</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={sharing}>
          {sharing ? 'Adding…' : 'Add'}
        </button>
      </form>
      <h3>Shared with</h3>
      {shares.length === 0 ? (
        <p className="share-empty">Not shared with anyone yet.</p>
      ) : (
        <ul className="share-list">
          {shares.map((s) => (
            <li key={s.id}>
              <span className="share-email">{s.shared_with_email || '—'}</span>
              <span className="share-role">{s.role}</span>
              <button type="button" className="btn btn-danger btn-small" onClick={() => onRevokeShare(s.id)}>
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
