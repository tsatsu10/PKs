/**
 * Object title with optional pin indicator.
 */
export default function TitleCluster({ object, className = '' }) {
  return (
    <span className={`title-cluster${className ? ` ${className}` : ''}`}>
      {object.is_pinned && (
        <span className="title-cluster-pin" aria-label="Pinned" title="Pinned">★</span>
      )}
      <span className="title-cluster-text">{object.title}</span>
    </span>
  );
}
