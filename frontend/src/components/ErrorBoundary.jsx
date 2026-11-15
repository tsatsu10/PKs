import { Component } from 'react';
import { reportError } from '../lib/reportError';

const CHUNK_FLAG = 'pks-chunk-reload';
const CHUNK_RELOAD_WINDOW_MS = 10_000;
const CHUNK_MESSAGE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** A lazy page's file is gone (usually a deploy replaced it while this tab was open). */
export function isChunkLoadError(err) {
  if (!err || typeof err !== 'object') return false;
  return err.name === 'ChunkLoadError' || (typeof err.message === 'string' && CHUNK_MESSAGE.test(err.message));
}

function readFlag() {
  try { return Number(sessionStorage.getItem(CHUNK_FLAG)) || 0; } catch { return 0; }
}
function writeFlag(value) {
  try {
    if (value === null) sessionStorage.removeItem(CHUNK_FLAG);
    else sessionStorage.setItem(CHUNK_FLAG, String(value));
  } catch { /* storage blocked: the Reload button still works */ }
}

const INITIAL = { hasError: false, error: null, recorded: false, chunk: null };

/**
 * Catches React render errors in the tree and shows a fallback UI, so one broken page doesn't
 * unmount the app. A new `resetKey` (the route) clears the error. A stale lazy chunk reloads
 * the page once; if that happened in the last 10 s, it offers a Reload button instead of looping.
 */
export default class ErrorBoundary extends Component {
  state = INITIAL;

  static getDerivedStateFromError(error) {
    let chunk = null;
    if (isChunkLoadError(error)) {
      const last = readFlag();
      chunk = !last || Date.now() - last > CHUNK_RELOAD_WINDOW_MS ? 'reload' : 'stale';
    }
    return { hasError: true, error, chunk };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    const recorded = reportError(error);
    if (this.state.chunk === 'reload') {
      writeFlag(Date.now());
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
