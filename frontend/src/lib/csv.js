/**
 * Minimal RFC 4180 CSV parser.
 * Handles quoted fields containing commas, newlines, and escaped quotes ("").
 * Accepts LF, CRLF, and bare CR line endings.
 * Returns an array of rows, each an array of raw string cells.
 */
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) endRow();

  // Drop rows that are entirely empty (e.g. trailing newline).
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
}
