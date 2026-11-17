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
 * Open a URL in a new tab. A synthetic anchor click is never treated as a popup,
 * so — unlike window.open — it stays allowed after an await, and COOP never sees
 * an opener relationship (rel=noopener).
 * @param {string} url
 */
export function openInNewTab(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Open the browser print dialog (where users pick "Save as PDF") for an HTML
 * document, via a short-lived off-screen iframe. Needs no user gesture and no
 * window.open (which COOP same-origin breaks): the iframe is same-origin and its
 * browsing context is discarded after printing.
 * @param {string} html - complete, already-sanitized HTML document
 * @returns {boolean} false when the iframe could not be prepared
 */
export function printHtml(html) {
  const frame = document.createElement('iframe');
  // Off-screen but rendered: a display:none iframe is skipped by some print engines.
  frame.style.position = 'fixed';
  frame.style.right = '100%';
  frame.style.bottom = '100%';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  if (!doc || !view) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  view.focus();
  view.print();
  const cleanup = () => frame.remove();
  view.addEventListener('afterprint', cleanup, { once: true });
  // Fallback for engines that never fire afterprint; harmless if cleanup already ran.
  setTimeout(cleanup, 60_000);
  return true;
}
