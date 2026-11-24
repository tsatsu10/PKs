import Button from './ui/Button';
import Field from './ui/Field';
import Input, { Textarea } from './ui/Input';

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
      <Field label="Title" labelHidden>
        {(f) => (
          <Input id={f.id} ref={inputRef} type="text" value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="Title" required />
        )}
      </Field>
      <Field label="Content" labelHidden>
        {(f) => (
          <Textarea id={f.id} value={content} onChange={(e) => onContentChange(e.target.value)} placeholder="Content…" rows={3} required />
        )}
      </Field>
      <div className="dashboard-quick-add-actions">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button>
      </div>
    </form>
  );
}
