import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import Button from './ui/Button';
import Field from './ui/Field';
import Input from './ui/Input';
import Select from './ui/Select';

/**
 * Entity picker (domain or tag) with inline create. Creating starts from its own button,
 * so choosing in the select never changes what is on screen (A6).
 */
export default function EntityComboBox({
  label,
  value,
  onChange,
  options,
  onCreate,
  placeholder = 'Any',
  createLabel = 'Create',
  disabled = false,
}) {
  const createInputRef = useRef(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  const cancelCreate = () => {
    setCreating(false);
    setNewName('');
    setLocalError('');
  };

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name || !onCreate) return;
    setBusy(true);
    setLocalError('');
    try {
      const created = await onCreate(name);
      onChange(created.id);
      setCreating(false);
      setNewName('');
    } catch (err) {
      setLocalError(err?.message || 'Could not create');
    } finally {
      setBusy(false);
    }
  };

  const nameLabel = `New ${label.toLowerCase()} name`;
  return (
    <div className="entity-combobox">
      <Field label={label}>
        {(f) => (
          <Select id={f.id} value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled || busy}>
            <option value="">{placeholder}</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
          </Select>
        )}
      </Field>
      {onCreate && !creating && (
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)} disabled={disabled}>
          <Plus size={16} aria-hidden="true" />
          {createLabel}
        </Button>
      )}
      {creating && onCreate && (
        <Field label={nameLabel} labelHidden error={localError || undefined}>
          {(f) => (
            <div className="entity-combobox-create">
              <Input
                id={f.id}
                ref={createInputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={nameLabel}
                disabled={busy}
                maxLength={120}
                invalid={f.invalid}
                aria-describedby={f.describedBy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitCreate();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelCreate();
                  }
                }}
              />
              <Button variant="primary" size="sm" onClick={submitCreate} disabled={busy || !newName.trim()}>{busy ? '…' : 'Add'}</Button>
              <Button variant="ghost" size="sm" onClick={cancelCreate} disabled={busy}>Cancel</Button>
            </div>
          )}
        </Field>
      )}
    </div>
  );
}
