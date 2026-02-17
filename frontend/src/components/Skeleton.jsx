/**
 * Simple skeleton placeholder for loading states.
 * Use className for size (e.g. skeleton-line, skeleton-card).
 */
export default function Skeleton({ className = '', style = {} }) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}

export function SkeletonList({ lines = 5 }) {
  return (
    <ul className="skeleton-list" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <li key={i} className="skeleton-list-item">
          <Skeleton className="skeleton-line" style={{ width: '20%', height: 12 }} />
          <Skeleton className="skeleton-line" style={{ width: '70%', height: 16 }} />
          <Skeleton className="skeleton-line" style={{ width: '50%', height: 12 }} />
        </li>
      ))}
    </ul>
  );
}

export function SkeletonDetail() {
  return (
    <div className="skeleton-detail" aria-hidden="true">
      <Skeleton className="skeleton-line" style={{ width: '40%', height: 28, marginBottom: 8 }} />
      <Skeleton className="skeleton-line" style={{ width: '60%', height: 14, marginBottom: 16 }} />
      <Skeleton className="skeleton-line" style={{ width: '100%', height: 14 }} />
      <Skeleton className="skeleton-line" style={{ width: '100%', height: 14 }} />
      <Skeleton className="skeleton-line" style={{ width: '80%', height: 14, marginBottom: 24 }} />
      <Skeleton className="skeleton-line" style={{ width: '100%', height: 80 }} />
    </div>
  );
}
