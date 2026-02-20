/**
 * Quick-add form for creating a new note from the dashboard.
 */
export default function DashboardQuickAddForm({
  title,
  content,
  onTitleChange,
  onContentChange,
  onSubmit,
  onCancel,
  saving,
  inputRef,
}) {
  return (
    <form onSubmit={onSubmit} className="dashboard-quick-add-form">
      <div className="dashboard-quick-add-row">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Title"
          className="dashboard-quick-add-title"
          required
          aria-label="Title"
        />
        <div className="dashboard-quick-add-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder="Content…"
        className="dashboard-quick-add-content"
        rows={3}
        required
        aria-label="Content"
      />
    </form>
  );
}
