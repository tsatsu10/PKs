import { Link } from 'react-router-dom';

/**
 * @param {{ items: Array<{ label: string, to?: string }> }} props
 */
export default function Breadcrumbs({ items }) {
  if (!items?.length) return null;
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol className="breadcrumbs-list">
        {items.map((item, i) => (
          <li key={i} className="breadcrumbs-item">
            {i > 0 && <span className="breadcrumbs-sep" aria-hidden="true">›</span>}
            {item.to ? (
              <Link to={item.to} className="breadcrumbs-link">{item.label}</Link>
            ) : (
              <span className="breadcrumbs-current" aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
