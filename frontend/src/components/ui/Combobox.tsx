import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import Field from './Field';
import './Spinner.css'; // .ui-visually-hidden
import './Input.css';
import './Combobox.css';

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

export interface ComboboxProps {
  label: string;
  labelHidden?: boolean;
  options: ComboboxOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  maxResults?: number;
  emptyText?: string;
  disabled?: boolean;
}

/**
 * ARIA 1.2 combobox with a listbox popup. Arrowing only moves the active option; only Enter on
 * the active option or a click on an option commits. Blur and Enter with the list closed never do.
 */
export default function Combobox({
  label,
  labelHidden = false,
  options,
  onSelect,
  placeholder,
  maxResults = 50,
  emptyText = 'No matches',
  disabled = false,
}: ComboboxProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return matches.slice(0, maxResults);
  }, [options, query, maxResults]);

  const optionId = (i: number) => `${listId}-option-${i}`;

  const openList = () => {
    setOpen(true);
    setActive(results.length > 0 ? 0 : -1);
  };

  const commit = (value: string) => {
    onSelect(value);
    setQuery('');
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // An IME uses Enter and Escape to confirm or cancel its own composition.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else if (results.length) setActive((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList();
        else if (results.length) setActive((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (open && results.length) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open && results.length) {
          e.preventDefault();
          setActive(results.length - 1);
        }
        break;
      case 'Enter':
        if (open && active >= 0 && results[active]) {
          e.preventDefault();
          commit(results[active].value);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (query) {
          e.preventDefault();
          setQuery('');
        }
        break;
      default:
        break;
    }
  };

  const announcement = open ? `${results.length} result${results.length === 1 ? '' : 's'}` : '';

  return (
    <Field label={label} labelHidden={labelHidden} className="ui-combobox">
      {(ids) => (
        <div className="ui-combobox-control">
          <input
            id={ids.id}
            aria-describedby={ids.describedBy}
            className="ui-input"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            placeholder={placeholder}
            disabled={disabled}
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setOpen(true);
              const q = next.trim().toLowerCase();
              const any = q ? options.some((o) => o.label.toLowerCase().includes(q)) : options.length > 0;
              setActive(any ? 0 : -1);
            }}
            onKeyDown={onKeyDown}
            // A click or tap shows the list, so options can be browsed without typing or a keyboard.
            onClick={() => { if (!open) openList(); }}
            onBlur={() => {
              setOpen(false);
              setActive(-1);
            }}
          />
          <ul id={listId} role="listbox" aria-label={label} className="ui-combobox-list" hidden={!open}>
            {open && results.length === 0 && (
              <li role="presentation" className="ui-combobox-empty">{emptyText}</li>
            )}
            {open &&
              results.map((o, i) => (
                <li
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  className="ui-combobox-option"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(o.value);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="ui-combobox-option-label">{o.label}</span>
                  {o.hint && <span className="ui-combobox-option-hint">{o.hint}</span>}
                </li>
              ))}
          </ul>
          <span className="ui-visually-hidden" aria-live="polite">{announcement}</span>
        </div>
      )}
    </Field>
  );
}
