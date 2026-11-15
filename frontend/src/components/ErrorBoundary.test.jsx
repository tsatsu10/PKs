import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const rep = vi.hoisted(() => ({ reportError: vi.fn(() => true) }));
vi.mock('../lib/reportError', () => rep);

import ErrorBoundary, { isChunkLoadError } from './ErrorBoundary';

const FLAG = 'pks-chunk-reload';
let boom = null;
function Child() {
  if (boom) throw boom;
  return <p>child ok</p>;
}
const chunkErr = () => new TypeError('Failed to fetch dynamically imported module: https://pks.app/assets/Page-abc.js');

beforeEach(() => {
  boom = null;
  sessionStorage.clear();
  rep.reportError.mockReset().mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('a new resetKey (route) clears the error and renders the children again', () => {
    boom = new Error('kaput');
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Child /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    boom = null;
    rerender(<ErrorBoundary resetKey="/b"><Child /></ErrorBoundary>);
    expect(screen.getByText('child ok')).toBeInTheDocument();
  });

  it('reports a caught error once and says it was recorded when the report went out', () => {
    boom = new Error('kaput');
    render(<ErrorBoundary><Child /></ErrorBoundary>);
    expect(rep.reportError).toHaveBeenCalledWith(boom);
    expect(screen.getByRole('alert')).toHaveTextContent('recorded');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('does not claim the error was recorded when the report was skipped', () => {
    rep.reportError.mockReturnValue(false);
    boom = new Error('kaput');
    render(<ErrorBoundary><Child /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/recorded/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('a stale chunk with no recent reload reloads once and sets the flag', () => {
    const reload = vi.fn();
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    boom = chunkErr();
    render(<ErrorBoundary reload={reload}><Child /></ErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(FLAG)).toBe('100000');
  });

  it('a stale chunk right after a reload offers Reload instead of looping', () => {
    const reload = vi.fn();
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    sessionStorage.setItem(FLAG, String(98_000));
    boom = chunkErr();
    render(<ErrorBoundary reload={reload}><Child /></ErrorBoundary>);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText('A new version of PKS is available.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(sessionStorage.getItem(FLAG)).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a reload flag older than 10 s reloads again', () => {
    const reload = vi.fn();
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    sessionStorage.setItem(FLAG, String(89_000));
    boom = chunkErr();
    render(<ErrorBoundary reload={reload}><Child /></ErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('isChunkLoadError', () => {
  it('matches the browsers’ dynamic-import failures and ChunkLoadError', () => {
    expect(isChunkLoadError(chunkErr())).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadError(new Error('kaput'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
