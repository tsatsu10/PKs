import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import QueryError from '../../components/QueryError';
import TypeMark from '../../components/TypeMark';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Combobox from '../../components/ui/Combobox';
import IconButton from '../../components/ui/IconButton';
import { formatObjectTypeLabel } from '../../constants';
import type { useLinks } from './hooks/useLinks';
import type { LinkTarget, OutgoingLink, IncomingLink, SuggestedLink } from './types';

type Props = {
  isOwner: boolean;
  /** Shows the "Related you might link" card (owner only, as before). */
  canLink: boolean;
  outgoing: OutgoingLink[];
  incoming: IncomingLink[];
  availableToLink: LinkTarget[];
  suggested: SuggestedLink[];
  error: unknown;
  onRetry: () => void;
  links: Pick<ReturnType<typeof useLinks>, 'addLink' | 'removeLink'>;
  prefetch: (id: string) => object;
};

function AddLinkSelect({ options, addLink }: { options: LinkTarget[]; addLink: (id: string) => unknown }) {
  return (
    <Combobox
      label="Link to object"
      labelHidden
      placeholder="Search objects…"
      options={options.map((o) => ({ value: o.id, label: o.title, hint: formatObjectTypeLabel(o.type) }))}
      onSelect={(id) => { addLink(id); }}
    />
  );
}

/** The "Related you might link" card and the Links card (outgoing and incoming). */
export default function Links({ isOwner, canLink, outgoing, incoming, availableToLink, suggested, error, onRetry, links, prefetch }: Props) {
  const { addLink, removeLink } = links;
  const related = suggested.filter((o) => !outgoing.some((l) => l.to_object_id === o.id));
  const showAdd = isOwner && availableToLink.length > 0;
  const list = (rows: Array<{ id: string; to: string; title: string; type: string }>, outgoingSide: boolean) => (
    <ul className="links-list">
      {rows.map((l) => (
        <li key={l.id}>
          <Link to={`/objects/${l.to}`} {...prefetch(l.to)}>{l.title}</Link>
          <span className="link-type">{l.type}</span>
          {isOwner && <IconButton label="Remove link" icon={X} iconSize={16} onClick={() => removeLink(l.id, outgoingSide)} />}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {canLink && related.length > 0 && (
        <Card as="section" title="Related you might link">
          <div className="detail-related-grid">
            {related.slice(0, 4).map((o) => (
              <div key={o.id} className="detail-related-card">
                <Link to={`/objects/${o.id}`} className="detail-related-title-link" {...prefetch(o.id)}>{o.title}</Link>
                <span className="detail-related-type">
                  <TypeMark type={o.type} size="sm" />
                  {formatObjectTypeLabel(o.type)}
                </span>
                <Button variant="primary" size="sm" onClick={() => addLink(o.id)}>Link</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card as="section" title="Links">
        {error ? (
          <QueryError what="links" error={error} onRetry={onRetry} />
        ) : outgoing.length === 0 && incoming.length === 0 ? (
          <>
            <p className="detail-empty">No links yet.</p>
            {showAdd && <AddLinkSelect options={availableToLink} addLink={addLink} />}
          </>
        ) : (
          <>
            <h4 className="detail-section-card-sub">Outgoing</h4>
            {outgoing.length === 0 ? (
              <p className="detail-empty">None yet.</p>
            ) : (
              list(outgoing.map((l) => ({ id: l.id, to: l.to_object_id, title: l.target?.title ?? l.to_object_id, type: l.relationship_type })), true)
            )}
            {showAdd && <AddLinkSelect options={availableToLink} addLink={addLink} />}
            <h4 className="detail-section-card-sub">Incoming</h4>
            {incoming.length === 0 ? (
              <p className="detail-empty">None yet.</p>
            ) : (
              list(incoming.map((l) => ({ id: l.id, to: l.from_object_id, title: l.source?.title ?? l.from_object_id, type: l.relationship_type })), false)
            )}
          </>
        )}
      </Card>
    </>
  );
}
