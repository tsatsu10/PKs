import QueryError from '../../components/QueryError';
import Card from '../../components/ui/Card';
import Chip from '../../components/ui/Chip';
import Combobox from '../../components/ui/Combobox';
import type { useTaxonomyActions } from './hooks/useTaxonomyActions';
import type { PanelName } from './useObjectPage';
import type { Named, SuggestedTag } from './types';
import Button from '../../components/ui/Button';

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

/**
 * The Domains and Tags cards. Only the owner can add or remove. The owner's pickers stay mounted
 * when nothing is left to add, so focus isn't dropped after adding the last one.
 */
export default function Taxonomy({ isOwner, objectDomains, objectTags, availableDomains, availableTags, suggestedTags, panelErrors, retryPanel, actions }: Props) {
  const { addDomain, removeDomain, addTag, removeTag } = actions;
  const domainsError = panelErrors.domains ?? panelErrors.taxonomy;
  const tagsError = panelErrors.tags ?? panelErrors.taxonomy;
  const suggestions = suggestedTags.filter((s) => !objectTags.some((ot) => ot.id === s.tag_id));
  return (
    <>
      <Card as="section" title="Domains">
        {domainsError ? (
          <QueryError what="domains" error={domainsError} onRetry={() => retryPanel(panelErrors.domains ? 'domains' : 'taxonomy')} />
        ) : (
          <>
            {objectDomains.length === 0 && <p className="detail-empty">No domains yet.</p>}
            <div className="chips">
              {objectDomains.map((d) => (
                <Chip key={d.id} onRemove={isOwner ? () => removeDomain(d.id) : undefined} removeLabel={`Remove domain ${d.name}`}>{d.name}</Chip>
              ))}
            </div>
            {isOwner && (
              <Combobox
                label="Add domain"
                labelHidden
                placeholder="Add domain…"
                emptyText={availableDomains.length === 0 ? 'No more domains to add' : undefined}
                options={availableDomains.map((d) => ({ value: d.id, label: d.name }))}
                onSelect={addDomain}
              />
            )}
          </>
        )}
      </Card>
      <Card as="section" title="Tags">
        {tagsError ? (
          <QueryError what="tags" error={tagsError} onRetry={() => retryPanel(panelErrors.tags ? 'tags' : 'taxonomy')} />
        ) : (
          <>
            {objectTags.length === 0 && <p className="detail-empty">No tags yet.</p>}
            <div className="chips">
              {objectTags.map((t) => (
                <Chip key={t.id} onRemove={isOwner ? () => removeTag(t.id) : undefined} removeLabel={`Remove tag ${t.name}`}>{t.name}</Chip>
              ))}
            </div>
            {isOwner && suggestions.length > 0 && (
              <div className="chips chips-suggested">
                <span className="muted">Suggested: </span>
                {suggestions.map((s) => (
                  <Button key={s.tag_id} size="sm" className="chip-suggested" onClick={() => addTag(s.tag_id)} title={`Add ${s.tag_name} (used ${s.usage_count}x in related objects)`}>
                    +{s.tag_name}
                  </Button>
                ))}
              </div>
            )}
            {isOwner && (
              <Combobox
                label="Add tag"
                labelHidden
                placeholder="Add tag…"
                emptyText={availableTags.length === 0 ? 'No more tags to add' : undefined}
                options={availableTags.map((t) => ({ value: t.id, label: t.name }))}
                onSelect={addTag}
              />
            )}
          </>
        )}
      </Card>
    </>
  );
}
