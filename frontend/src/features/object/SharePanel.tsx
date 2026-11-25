import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import type { useShares, ShareRole } from './hooks/useShares';

/** Share panel: add a share by email, list shares and pending invites, revoke. */
export default function SharePanel({ shares, onClose }: { shares: ReturnType<typeof useShares>; onClose: () => void }) {
  const { shares: rows, email, setEmail, role, setRole, sharing, add, revoke } = shares;
  return (
    <Card as="section" title="Share object" titleLevel={2} className="detail-panel" actions={<Button size="sm" onClick={onClose}>Close</Button>}>
      <form onSubmit={add} className="detail-panel-form">
        <Field label="Email">
          {(f) => <Input id={f.id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="collaborator@example.com" required />}
        </Field>
        <Field label="Role">
          {(f) => (
            <Select id={f.id} value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
              <option value="viewer">Viewer (read only)</option>
              <option value="editor">Editor (can edit content)</option>
            </Select>
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={sharing}>{sharing ? 'Adding…' : 'Add'}</Button>
      </form>
      <h3 className="detail-section-card-sub">Shared with</h3>
      {rows.length === 0 ? (
        <p className="detail-empty">Not shared with anyone yet.</p>
      ) : (
        <ul className="share-list">
          {rows.map((s) => (
            <li key={s.id}>
              <span className="share-email">{s.shared_with_email || '—'}</span>
              {s.pending && <span className="muted"> · pending</span>}
              <span className="share-role">{s.role}</span>
              <Button variant="danger" size="sm" onClick={() => revoke(s.id)}>Revoke</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
