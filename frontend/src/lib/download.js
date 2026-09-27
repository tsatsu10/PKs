/**
 * Browser file download and print helpers.
 */

/**
 * Save a Blob as a file. The anchor is attached to the document and the object
 * URL is revoked later: revoking synchronously cancels the download in some browsers.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open the browser print dialog (where users pick "Save as PDF") for an HTML
 * document. Must be called synchronously from a click handler, or popup
 * blockers will stop it. `noopener` can't be used: it makes window.open return null.
 * @param {string} html - complete, already-sanitized HTML document
 * @returns {boolean} false when the popup was blocked
 */
export function printHtml(html) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.opener = null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
