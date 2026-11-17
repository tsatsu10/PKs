import { Link } from 'react-router-dom';
import QueryError from '../../components/QueryError';
import TypeMark from '../../components/TypeMark';
import Combobox from '../../components/ui/Combobox';
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
  return (
    <>
      {canLink && related.length > 0 && (
        <div className="detail-section-card detail-related">
          <h3 className="detail-section-card-title">Related you might link</h3>
          <div className="detail-related-grid">
            {related.slice(0, 4).map((o) => (
              <div key={o.id} className="detail-related-card">
                <Link to={`/objects/${o.id}`} className="detail-related-title-link" {...prefetch(o.id)}>{o.title}</Link>
                <span className="detail-related-type">
                  <TypeMark type={o.type} size="sm" className="detail-related-type-mark" />
                  {formatObjectTypeLabel(o.type)}
                </span>
                <button type="button" className="btn btn-primary btn-small detail-related-link-btn" onClick={() => addLink(o.id)}>Link</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="detail-section-card">
        <h3 className="detail-section-card-title">Links</h3>
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
              <ul className="links-list">
                {outgoing.map((l) => (
                  <li key={l.id}>
                    <Link to={`/objects/${l.to_object_id}`} {...prefetch(l.to_object_id)}>{l.target?.title ?? l.to_object_id}</Link>
                    <span className="link-type">{l.relationship_type}</span>
                    {isOwner && <button type="button" className="chip-remove" onClick={() => removeLink(l.id, true)} aria-label="Remove link">×</button>}
                  </li>
                ))}
              </ul>
            )}
            {showAdd && <AddLinkSelect options={availableToLink} addLink={addLink} />}
            <h4 className="detail-section-card-sub">Incoming</h4>
            {incoming.length === 0 ? (
              <p className="detail-empty">None yet.</p>
            ) : (
              <ul className="links-list">
                {incoming.map((l) => (
                  <li key={l.id}>
                    <Link to={`/objects/${l.from_object_id}`} {...prefetch(l.from_object_id)}>{l.source?.title ?? l.from_object_id}</Link>
                    <span className="link-type">{l.relationship_type}</span>
                    {isOwner && <button type="button" className="chip-remove" onClick={() => removeLink(l.id, false)} aria-label="Remove link">×</button>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}
