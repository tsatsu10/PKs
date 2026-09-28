import { useState } from 'react';
import { parseOptions } from '../lib/templateOptions';

/**
 * Comma-separated options field. Keeps the raw text while typing (so commas and
 * trailing spaces survive) and commits the parsed list on blur.
 */
export default function OptionsInput({ options, onCommit, className, placeholder, ariaLabel }) {
  const [text, setText] = useState(() => (Array.isArray(options) ? options.join(', ') : ''));
  return (
    <input
      type="text"
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(parseOptions(text))}
    />
  );
}
