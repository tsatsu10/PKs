import { useState, type ReactNode } from 'react';
import ContentView from './ContentView';
import type { ObjectRow } from './types';

/** 16:9 box the cover renders in, so the layout doesn't shift while the image loads (P6). */
function CoverImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <figure className="detail-cover-wrap">
      <img
        src={src}
        alt=""
        className="detail-cover"
        width={1200}
        height={675}
        decoding="async"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </figure>
  );
}

/** The read view: title, cover, source, summary, the owner's Synthesize slot, and the content. */
export default function ReadOnlyBody({ object, synthesize }: { object: ObjectRow; synthesize?: ReactNode }) {
  const isBookmark = object.type === 'bookmark';
  return (
    <>
      <h1 className="detail-title">{object.title}</h1>
      {object.cover_url && <CoverImage src={object.cover_url} />}
      {object.source && (
        <div className={isBookmark ? 'detail-bookmark-url' : 'detail-reference-wrap'}>
          <p className="detail-reference">
            <span className="detail-reference-label">{isBookmark ? 'URL' : 'Reference / URL'}</span>
            {/^https?:\/\//i.test(object.source.trim()) ? (
              <>
                <a href={object.source.trim()} target="_blank" rel="noopener noreferrer" className="detail-reference-link">{object.source}</a>
                {isBookmark && (
                  <a href={object.source.trim()} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-small detail-open-link">Open link</a>
                )}
              </>
            ) : (
              <span className="detail-reference-text">{object.source}</span>
            )}
          </p>
        </div>
      )}
      {object.summary && <p className="detail-summary">{object.summary}</p>}
      {synthesize}
      <ContentView key={`${object.id}:${object.revision}`} json={object.content_json} markdown={object.content} />
    </>
  );
}
