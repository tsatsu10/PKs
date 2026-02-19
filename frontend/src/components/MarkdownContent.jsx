import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders markdown content as HTML using react-markdown and remark-gfm.
 * Used for the Knowledge object detail view and consistent typography.
 */
export default function MarkdownContent({ content, className = '' }) {
  if (content == null || content === '') return null;
  return (
    <div className={`markdown-content ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
