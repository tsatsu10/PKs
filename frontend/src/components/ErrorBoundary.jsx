import { Component } from 'react';
import { reportError } from '../lib/reportError';

const CHUNK_FLAG = 'pks-chunk-reload';
/** No automatic reload within 10 s of the last one. */
const CHUNK_RELOAD_GAP_MS = 10_000;
/** At most this many automatic reloads per window, so a slow reload loop still stops. */
const CHUNK_MAX_RELOADS = 2;
const CHUNK_COUNT_WINDOW_MS = 5 * 60_000;
const CHUNK_MESSAGE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** A lazy page's file is gone (usually a deploy replaced it while this tab was open). */
export function isChunkLoadError(err) {
  if (!err || typeof err !== 'object') return false;
  return err.name === 'ChunkLoadError' || (typeof err.message === 'string' && CHUNK_MESSAGE.test(err.message));
}

/** The last automatic reload: when, and how many there have been in the current window. */
function readFlag() {
  let raw = null;
  try { raw = sessionStorage.getItem(CHUNK_FLAG); } catch { /* storage blocked */ }
  if (!raw) return { at: 0, count: 0 };
  try {
    const v = JSON.parse(raw);
    if (typeof v === 'number') return { at: v, count: 1 }; // the old time-only flag
    if (v && Number.isFinite(v.at) && Number.isFinite(v.count)) return { at: v.at, count: v.count };
  } catch { /* unreadable: treat as absent */ }
  return { at: 0, count: 0 };
}
function writeFlag(value) {
  try {
    if (value === null) sessionStorage.removeItem(CHUNK_FLAG);
    else sessionStorage.setItem(CHUNK_FLAG, JSON.stringify(value));
  } catch { /* storage blocked: the Reload button still works */ }
}

/** Whether a stale chunk may reload automatically now, and the flag to store if it does. */
export function chunkReloadDecision(flag, now) {
  const count = now - flag.at > CHUNK_COUNT_WINDOW_MS ? 0 : flag.count;
  const ok = count < CHUNK_MAX_RELOADS && (!flag.at || now - flag.at > CHUNK_RELOAD_GAP_MS);
  return ok ? { reload: true, next: { at: now, count: count + 1 } } : { reload: false, next: null };
}

const INITIAL = { hasError: false, error: null, recorded: false, chunk: null, chunkFlag: null };

/**
 * Catches React render errors in the tree and shows a fallback UI, so one broken page doesn't
 * unmount the app. A new `resetKey` (the route) clears the error. A stale lazy chunk reloads
 * the page; if one did in the last 10 s, or twice in 5 minutes, it offers a Reload button instead
 * of looping.
 */
export default class ErrorBoundary extends Component {
  state = INITIAL;

  static getDerivedStateFromError(error) {
    let chunk = null;
    let chunkFlag = null;
    if (isChunkLoadError(error)) {
      const d = chunkReloadDecision(readFlag(), Date.now());
      chunk = d.reload ? 'reload' : 'stale';
      chunkFlag = d.next;
    }
    return { hasError: true, error, chunk, chunkFlag };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    const recorded = reportError(error);
    if (this.state.chunk === 'reload') {
      writeFlag(this.state.chunkFlag);
      this.reload();
    }
    this.setState({ recorded });
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) this.setState(INITIAL);
  }

  reload() {
    (this.props.reload ?? (() => window.location.reload()))();
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { chunk, recorded, error } = this.state;
    if (chunk === 'reload') return null;
    if (chunk === 'stale') {
      return (
        <div className="error-boundary-fallback" role="alert">
          <p>A new version of PKS is available.</p>
          <button type="button" onClick={() => { writeFlag(null); this.reload(); }}>Reload</button>
        </div>
      );
    }
    const { fallback: Fallback } = this.props;
    if (Fallback) return <Fallback error={error} />;
    return (
      <div className="error-boundary-fallback" role="alert">
        <h2>Something went wrong.</h2>
        <p>{recorded ? 'We’ve recorded the error. Try refreshing the page.' : 'Try refreshing the page.'}</p>
        <button type="button" onClick={() => this.setState(INITIAL)}>Try again</button>
      </div>
    );
  }
}
