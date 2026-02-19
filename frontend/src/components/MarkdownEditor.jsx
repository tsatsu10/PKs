import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import './MarkdownEditor.css';

/**
 * Reusable Markdown editor with toolbar (bold, italic, headings, lists, link).
 * Accepts value and onChange(string) for controlled usage.
 */
export default function MarkdownEditor({ value = '', onChange, placeholder = 'Main content', minHeight = 200, id, 'aria-label': ariaLabel }) {
  const handleChange = (val) => {
    onChange?.(val ?? '');
  };

  return (
    <div className="markdown-editor-wrapper" data-color-mode="dark">
      <MDEditor
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        height={minHeight}
        placeholder={placeholder}
        visibleDragbar={false}
        preview="edit"
      />
    </div>
  );
}
