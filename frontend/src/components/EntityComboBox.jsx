import { useState, useId, useRef, useEffect } from 'react';
import './EntityComboBox.css';

/**
 * Filter-friendly entity picker with inline create (domain or tag).
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
  const inputId = useId();
  const createInputRef = useRef(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (creating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [creating]);

  const handleSelectChange = (e) => {
    const next = e.target.value;
    if (next === '__create__') {
      setCreating(true);
      setNewName('');
      setLocalError('');
      return;
    }
    setCreating(false);
    onChange(next);
  };

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

  return (
    <div className="entity-combobox">
      <label htmlFor={inputId} className="entity-combobox-label">
        {label}
      </label>
      <div className="entity-combobox-row">
        <select
          id={inputId}
          className="entity-combobox-select"
          value={creating ? '__create__' : (value || '')}
          onChange={handleSelectChange}
          disabled={disabled || busy}
          aria-describedby={localError ? `${inputId}-error` : undefined}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
          {onCreate && <option value="__create__">+ {createLabel}…</option>}
        </select>
      </div>
      {creating && onCreate && (
        <div className="entity-combobox-create" role="group" aria-label={`${createLabel} ${label}`}>
          <input
            ref={createInputRef}
            type="text"
            className="entity-combobox-create-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`New ${label.toLowerCase()} name`}
            disabled={busy}
            maxLength={120}
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
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={submitCreate}
            disabled={busy || !newName.trim()}
          >
            {busy ? '…' : 'Add'}
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={cancelCreate} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
      {localError && (
        <p id={`${inputId}-error`} className="entity-combobox-error" role="alert">
          {localError}
        </p>
      )}
    </div>
  );
}
