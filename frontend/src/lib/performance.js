/**
 * Lightweight performance marks/measures for key flows (search, list load).
 * Use in dev or behind a flag; avoid in production if not needed.
 */

const PREFIX = 'pks';

export function mark(name) {
  if (typeof performance !== 'undefined' && performance.mark) {
    try {
      performance.mark(`${PREFIX}-${name}`);
    } catch {
      // ignore
    }
  }
}

export function measure(measureName, startMark, endMark) {
  if (typeof performance !== 'undefined' && performance.measure) {
    try {
      performance.measure(`${PREFIX}-${measureName}`, `${PREFIX}-${startMark}`, endMark ? `${PREFIX}-${endMark}` : undefined);
    } catch {
      // ignore
    }
  }
}

export function measureSearchStart() {
  mark('search-start');
}

export function measureSearchEnd() {
  mark('search-end');
  measure('search-duration', 'search-start', 'search-end');
}

export function measureListLoadStart() {
  mark('list-load-start');
}

export function measureListLoadEnd() {
  mark('list-load-end');
  measure('list-load-duration', 'list-load-start', 'list-load-end');
}
