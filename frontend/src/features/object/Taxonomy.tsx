import QueryError from '../../components/QueryError';
import Combobox from '../../components/ui/Combobox';
import type { useTaxonomyActions } from './hooks/useTaxonomyActions';
import type { PanelName } from './useObjectPage';
import type { Named, SuggestedTag } from './types';

type Props = {
  isOwner: boolean;
  objectDomains: Named[];
  objectTags: Named[];
  availableDomains: Named[];
  availableTags: Named[];
  suggestedTags: SuggestedTag[];
  panelErrors: Partial<Record<PanelName, unknown>>;
  retryPanel: (name: PanelName) => unknown;
  actions: Pick<ReturnType<typeof useTaxonomyActions>, 'addDomain' | 'removeDomain' | 'addTag' | 'removeTag'>;
};

/** The Domains and Tags cards. Only the owner can add or remove. */
export default function Taxonomy({ isOwner, objectDomains, objectTags, availableDomains, availableTags, suggestedTags, panelErrors, retryPanel, actions }: Props) {
  const { addDomain, removeDomain, addTag, removeTag } = actions;
  const domainsError = panelErrors.domains ?? panelErrors.taxonomy;
  const tagsError = panelErrors.tags ?? panelErrors.taxonomy;
  return (
    <>
      <div className="detail-section-card">
        <h3 className="detail-section-card-title">Domains</h3>
        {domainsError ? (
          <QueryError what="domains" error={domainsError} onRetry={() => retryPanel(panelErrors.domains ? 'domains' : 'taxonomy')} />
        ) : objectDomains.length === 0 && !(isOwner && availableDomains.length > 0) ? (
          <p className="detail-empty">No domains yet.</p>
        ) : (
          <div className="chips">
            {objectDomains.map((d) => (
              <span key={d.id} className="chip">
                {d.name}
                {isOwner && <button type="button" className="chip-remove" onClick={() => removeDomain(d.id)} aria-label={`Remove ${d.name}`}>×</button>}
              </span>
            ))}
            {isOwner && availableDomains.length > 0 && (
              <Combobox
                label="Add domain"
                labelHidden
                placeholder="Add domain…"
                options={availableDomains.map((d) => ({ value: d.id, label: d.name }))}
                onSelect={addDomain}
              />
            )}
          </div>
        )}
      </div>
      <div className="detail-section-card">
        <h3 className="detail-section-card-title">Tags</h3>
        {tagsError ? (
          <QueryError what="tags" error={tagsError} onRetry={() => retryPanel(panelErrors.tags ? 'tags' : 'taxonomy')} />
        ) : objectTags.length === 0 && !(isOwner && (availableTags.length > 0 || suggestedTags.length > 0)) ? (
          <p className="detail-empty">No tags yet.</p>
        ) : (
          <div className="chips">
            {objectTags.map((t) => (
              <span key={t.id} className="chip">
                {t.name}
                {isOwner && <button type="button" className="chip-remove" onClick={() => removeTag(t.id)} aria-label={`Remove ${t.name}`}>×</button>}
              </span>
            ))}
            {isOwner && suggestedTags.length > 0 && (
              <span className="chips-suggested">
                <span className="muted">Suggested: </span>
                {suggestedTags.filter((s) => !objectTags.some((ot) => ot.id === s.tag_id)).map((s) => (
                  <button key={s.tag_id} type="button" className="chip chip-suggested" onClick={() => addTag(s.tag_id)} title={`Add ${s.tag_name} (used ${s.usage_count}x in related objects)`}>
                    +{s.tag_name}
                  </button>
                ))}
              </span>
            )}
            {isOwner && availableTags.length > 0 && (
              <Combobox
                label="Add tag"
                labelHidden
                placeholder="Add tag…"
                options={availableTags.map((t) => ({ value: t.id, label: t.name }))}
                onSelect={addTag}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
