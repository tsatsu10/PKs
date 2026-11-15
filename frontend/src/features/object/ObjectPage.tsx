import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { touchObjectView } from '../../lib/objectView';
import { usePrefetchObject } from '../../data/usePrefetchObject';
import { SkeletonDetail } from '../../components/Skeleton';
import { useObjectPage } from './useObjectPage';
import { useObjectActions } from './hooks/useObjectActions';
import { useTaxonomyActions } from './hooks/useTaxonomyActions';
import { useLinks } from './hooks/useLinks';
import { useAttachments } from './hooks/useAttachments';
import { useShares } from './hooks/useShares';
import { useRunPrompt } from './hooks/useRunPrompt';
import { useObjectExport } from './hooks/useObjectExport';
import Header from './Header';
import LinkSearch from './LinkSearch';
import MetaLine from './MetaLine';
import ReadOnlyBody from './ReadOnlyBody';
import Editor, { type EditorHandle } from './Editor';
import InPlaceFields from './InPlaceFields';
import Properties from './Properties';
import SaveIndicator from './SaveIndicator';
import ConflictBar from './ConflictBar';
import { useSaveQueue } from './save/useSaveQueue';
import type { SaveFields } from './save/saveQueue';
import { adoptLegacyDraft } from './legacyDraft';
import { useCreateState } from '../../data/createObject';
import { getErrorMessage } from '../../lib/errors';
import type { ObjectRow } from './types';
import { SynthesizeCta, RunPromptPanel } from './AiPanel';
import Taxonomy from './Taxonomy';
import Attachments from './Attachments';
import Links from './Links';
import History from './History';
import SharePanel from './SharePanel';
import ExportPanel from './ExportPanel';
import './ObjectPage.css';

/** The object page (`/objects/:id`). The route remounts it per id, so no state carries over. */
export default function ObjectPage() {
  const { id } = useParams();
  const { user } = useAuth() as { user: { id: string } | null };
  const userId = user?.id ?? undefined;
  const page = useObjectPage({ id, userId });
  const {
    object, loading, error, setError, versions, objectDomains,
    objectTags, allDomains, allTags, outgoingLinks, incomingLinks,
    otherObjects, attachedFiles, promptTemplates, promptRuns, setPromptRuns, suggestedTags,
    suggestedLinkedObjects, myShare, panelErrors, retryPanel,
  } = page;
  const prefetch = usePrefetchObject();
  const create = useCreateState(id);
  const isOwner = !!object && object.user_id === userId;
  const canEdit = isOwner || myShare?.role === 'editor';

  // A pre-2b edit draft (sessionStorage) is read once, removed, and moved into the save queue.
  const [legacy] = useState(() => (id ? adoptLegacyDraft(id) : null));
  const save = useSaveQueue({
    objectId: canEdit ? object?.id : undefined,
    userId,
    isOwner,
    baseRevision: object ? (legacy?.baseRevision ?? object.revision) : undefined,
  });
  const { queue } = save;
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (!queue || !legacy || adoptedRef.current) return;
    adoptedRef.current = true;
    // A local copy in IndexedDB is newer than any old-form draft.
    if (!save.restored) queue.change(legacy.fields);
  }, [queue, legacy, save.restored]);

  // Opened from a cached copy: when the fresh row is newer and nothing is typed yet, re-seed.
  const serverRevision = object?.revision;
  useEffect(() => {
    if (queue && serverRevision !== undefined) queue.adoptServerRevision(serverRevision);
  }, [queue, serverRevision]);

  // Fields and the editor seed once per object and per reload (Load theirs, restore): the server
  // row with any unsent edits on top. Background refetches never replace what is being typed.
  const seedKey = `${id}:${save.seed}`;
  const [seeded, setSeeded] = useState<{ key: string; value: ObjectRow } | null>(null);
  if (object && queue && seeded?.key !== seedKey) {
    const legacyFields = !save.restored && legacy && save.seed === 0 ? legacy.fields : {};
    setSeeded({ key: seedKey, value: { ...object, ...legacyFields, ...queue.pending() } as ObjectRow });
  }
  const initial = seeded?.key === seedKey ? seeded.value : null;
  const change = useCallback((fields: SaveFields) => { queue?.change(fields); }, [queue]);

  // A click on the empty area around the content puts the cursor at the end of it.
  const editorRef = useRef<EditorHandle>(null);
  const onMainClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.classList.contains('detail-hero') || target.classList.contains('detail-editor-area')) {
      editorRef.current?.focusEnd();
    }
  };

  const actions = useObjectActions({ object, userId, objectDomains, objectTags, queue, setError });
  const taxonomy = useTaxonomyActions({ object, allDomains, allTags, setError });
  const links = useLinks({ object, userId, otherObjects, setError });
  const attachments = useAttachments({ object, userId, setError });
  const shares = useShares({ object, userId, setError });
  const run = useRunPrompt({ object, userId, promptTemplates, setPromptRuns, setError });
  const exportState = useObjectExport({ object, userId, objectDomains, objectTags, outgoingLinks, incomingLinks, setError });
  const [showSharePanel, setShowSharePanel] = useState(false);

  const objectId = object?.id;
  const ownerId = object?.user_id;
  useEffect(() => {
    if (!objectId || !userId || ownerId !== userId) return;
    touchObjectView(objectId);
  }, [objectId, ownerId, userId]);

  // Owner perf check (hand-off): measure from open to first visible content per object id.
  const visibleMarkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!objectId || visibleMarkedRef.current === objectId) return;
    visibleMarkedRef.current = objectId;
    performance.mark('pks:object-visible');
  }, [objectId]);

  if (loading) return <div className="object-detail loading"><p className="sr-only" role="status" aria-live="polite">Loading…</p><SkeletonDetail /></div>;
  if (error && !object) return <div className="object-detail"><p className="detail-error" role="alert">{error}</p><Link to="/">Back to Dashboard</Link></div>;
  if (!object) return null;

  const availableDomains = allDomains.filter((d) => !objectDomains.some((od) => od.id === d.id));
  const availableTags = allTags.filter((t) => !objectTags.some((ot) => ot.id === t.id));
  const availableToLink = otherObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id));
  const historyProps = {
    isOwner, versions, versionsError: panelErrors.versions, onRetryVersions: () => retryPanel('versions'),
    promptRuns, promptTemplates, runsError: panelErrors.runs ?? panelErrors.prompts,
    onRetryRuns: () => retryPanel(panelErrors.runs ? 'runs' : 'prompts'),
    restoreVersion: actions.restoreVersion, restoringVersion: actions.restoringVersion,
  };

  // Until the row exists, actions on it (pin, delete, tags, links, versions...) would fail or wait
  // forever on the save queue. The editor stays usable: its edits wait for the insert.
  const creating = create.status !== 'none';

  return (
    <div className="object-detail">
      <Header
        object={object}
        isOwner={isOwner}
        canEdit={canEdit}
        canLink={canEdit}
        linkSearch={<LinkSearch links={links} outgoingLinks={outgoingLinks} prefetch={prefetch} />}
        actions={actions}
        onToggleExport={() => exportState.setShow((v) => !v)}
        onToggleShare={() => { setShowSharePanel((v) => !v); if (!showSharePanel) shares.load(); }}
        inert={creating}
      />
      {error && <div className="form-error" role="alert">{error}</div>}
      {create.status === 'failed' && (
        // The editor stays usable: its edits wait in the save queue until the object exists.
        <div className="conflict-bar" role="alert">
          <p className="conflict-bar-text">Couldn&apos;t create this object: {getErrorMessage(create.error)}</p>
          <div className="conflict-bar-actions">
            <button type="button" className="btn btn-primary btn-small" onClick={create.retry}>Retry</button>
          </div>
        </div>
      )}

      {showSharePanel && isOwner && <SharePanel shares={shares} onClose={() => setShowSharePanel(false)} />}
      {exportState.show && <ExportPanel exportState={exportState} />}

      <div className="detail-layout">
        <div className="detail-main" aria-label="Object content" onClick={canEdit ? onMainClick : undefined}>
          <div className="detail-hero">
            {canEdit && queue && save.state.status === 'conflict' && <ConflictBar queue={queue} />}
            {canEdit && (save.restored || legacy) && (
              <p className="detail-restored-notice" role="status">Restored unsaved changes</p>
            )}
            <MetaLine object={object} />
            {!canEdit ? (
              <ReadOnlyBody object={object} synthesize={isOwner ? <SynthesizeCta run={run} /> : null} />
            ) : initial ? (
              <>
                <InPlaceFields
                  key={`fields:${seedKey}`}
                  object={object}
                  initial={initial}
                  editable
                  onChange={change}
                  autoFocusTitle={object.title === '' && !object.content && !object.content_json?.length}
                  titleAddon={<SaveIndicator state={save.state} />}
                />
                <Properties key={`props:${seedKey}`} object={object} initial={initial} isOwner={isOwner} onChange={change} />
                {isOwner && <SynthesizeCta run={run} />}
                <div className="detail-editor-area">
                  <Editor
                    key={`editor:${seedKey}`}
                    ref={editorRef}
                    initialJson={initial.content_json}
                    initialMarkdown={initial.content ?? ''}
                    onChange={change}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
        <aside className="detail-sidebar" inert={creating}>
          <Taxonomy
            isOwner={isOwner}
            objectDomains={objectDomains}
            objectTags={objectTags}
            availableDomains={availableDomains}
            availableTags={availableTags}
            suggestedTags={suggestedTags}
            panelErrors={panelErrors}
            retryPanel={retryPanel}
            actions={taxonomy}
          />
          <Attachments isOwner={isOwner} files={attachedFiles} error={panelErrors.files} onRetry={() => retryPanel('files')} attachments={attachments} />
          <History variant="owner" {...historyProps} />
          <Links
            isOwner={isOwner}
            canLink={isOwner}
            outgoing={outgoingLinks}
            incoming={incomingLinks}
            availableToLink={availableToLink}
            suggested={suggestedLinkedObjects}
            error={panelErrors.links}
            onRetry={() => retryPanel('links')}
            links={links}
            prefetch={prefetch}
          />
          <History variant="readonly" {...historyProps} />
        </aside>
      </div>

      {run.showRunPanel && <RunPromptPanel object={object} run={run} promptTemplates={promptTemplates} error={error} />}
    </div>
  );
}
