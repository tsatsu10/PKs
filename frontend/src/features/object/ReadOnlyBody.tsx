import type { ReactNode } from 'react';
import ContentView from './ContentView';
import type { ObjectRow } from './types';

/** The read view: title, cover, source, summary, the owner's Synthesize slot, and the content. */
export default function ReadOnlyBody({ object, synthesize }: { object: ObjectRow; synthesize?: ReactNode }) {
  const isBookmark = object.type === 'bookmark';
  return (
    <>
      <h1 className="detail-title">{object.title}</h1>
      {object.cover_url && (
        <figure className="detail-cover-wrap">
          <img src={object.cover_url} alt="" className="detail-cover" />
        </figure>
      )}
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
