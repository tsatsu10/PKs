import { describe, it, expect, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { classifyError, getErrorMessage, isAppMessage, ERROR_MESSAGES, type ErrorKind } from './errors';

const pg = (code: string, message = 'x') => ({ code, message, details: '', hint: '' });

describe('classifyError', () => {
  afterEach(() => onlineManager.setOnline(true));

  const cases: Array<[string, unknown, ErrorKind]> = [
    ['Chromium fetch failure (supabase-js error object)', { message: 'TypeError: Failed to fetch', code: '' }, 'network'],
    ['Safari fetch failure', { message: 'Load failed', code: '' }, 'network'],
    ['Firefox fetch failure', new TypeError('NetworkError when attempting to fetch resource.'), 'network'],
    ['Functions fetch failure', new FunctionsFetchError(new TypeError('Failed to fetch')), 'network'],
    ['expired JWT (PostgREST)', pg('PGRST301', 'JWT expired'), 'auth'],
    ['401 status', { status: 401, message: 'nope' }, 'auth'],
    ['RLS code', pg('42501', 'permission denied'), 'permission'],
    ['RLS text', 'new row violates row-level security policy for table "x"', 'permission'],
    ['403 status', { status: 403, message: 'forbidden' }, 'permission'],
    ['not found', pg('PGRST116', 'JSON object requested, multiple (or no) rows returned'), 'not_found'],
    ['duplicate key', pg('23505', 'duplicate key value violates unique constraint "tags_name_key"'), 'conflict'],
    ['not-null', pg('23502'), 'validation'],
    ['check', pg('23514'), 'validation'],
    ['bad text representation', pg('22P02'), 'validation'],
    ['PostgREST bad request', pg('PGRST204'), 'validation'],
    ['raised by our SQL', pg('P0001', 'Tag name is required'), 'validation'],
    ['429', { status: 429, message: 'slow down' }, 'rate_limited'],
    ['PostgREST connection error', pg('PGRST000'), 'server'],
    ['statement timeout', pg('57014'), 'server'],
    ['500 status', { status: 500, message: 'boom' }, 'server'],
    ['programming error', new TypeError("Cannot read properties of undefined (reading 'id')"), 'unknown'],
    ['app-authored Error', new Error('Name is required'), 'unknown'],
  ];
  it.each(cases)('%s', (_label, err, kind) => {
    expect(classifyError(err)).toBe(kind);
  });

  it('reports network failures as offline while the browser is offline', () => {
    onlineManager.setOnline(false);
    expect(classifyError({ message: 'TypeError: Failed to fetch' })).toBe('offline');
  });

  it('reads the HTTP status of a FunctionsHttpError', () => {
    const err = new FunctionsHttpError(new Response('{}', { status: 429 }));
    expect(classifyError(err)).toBe('rate_limited');
  });
});

describe('getErrorMessage', () => {
  it('never shows raw database text', () => {
    const msg = getErrorMessage(pg('23505', 'duplicate key value violates unique constraint "tags_name_key"'));
    expect(msg).toBe(ERROR_MESSAGES.conflict);
    expect(msg).not.toMatch(/duplicate key/);
  });

  it('keeps the RLS hint for permission errors', () => {
    expect(getErrorMessage(pg('42501'))).toMatch(/Sign out and sign in again/);
  });

  it('accepts a string fallback for unknown errors (old signature)', () => {
    expect(getErrorMessage(new TypeError('x is undefined'), 'Failed to add tag')).toBe('Failed to add tag');
  });

  it('accepts per-kind overrides', () => {
    expect(getErrorMessage(pg('23505'), { conflict: 'A tag with that name already exists.' }))
      .toBe('A tag with that name already exists.');
  });

  it('a forced message always wins', () => {
    expect(getErrorMessage(pg('23505'), { message: 'Quota reached for today.' })).toBe('Quota reached for today.');
  });

  it('shows app-authored and SQL-raised messages as written', () => {
    expect(getErrorMessage(new Error('Name is required'))).toBe('Name is required');
    expect(getErrorMessage(pg('P0001', 'Too many shares in the last hour. Try again later.')))
      .toBe('Too many shares in the last hour. Try again later.');
    expect(getErrorMessage('Enter a prompt or select one from the Prompt Bank.'))
      .toBe('Enter a prompt or select one from the Prompt Bank.');
  });

  it('falls back for null and empty input', () => {
    expect(getErrorMessage(null)).toBe('Something went wrong');
    expect(getErrorMessage('', 'Load failed')).toBe('Load failed');
  });
});

describe('isAppMessage', () => {
  it('is false for programming errors and true for plain Errors', () => {
    expect(isAppMessage(new TypeError('boom'))).toBe(false);
    expect(isAppMessage(new Error('Name is required'))).toBe(true);
  });
});
