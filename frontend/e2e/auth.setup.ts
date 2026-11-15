import fs from 'node:fs';
import path from 'node:path';
import { test as setup, expect } from '@playwright/test';
import {
  E2E_EMAIL, E2E_PASSWORD, TEST_CAPTCHA_TOKEN, adminClient, anonClient, supabaseUrl,
} from './support';

const STATE_FILE = path.join(import.meta.dirname, '.auth', 'user.json');

/**
 * Creates the confirmed e2e user (idempotent) and signs it in once. The session is written into
 * the browser storage state exactly as supabase-js stores it, so every test starts signed in.
 */
setup('sign in the e2e user', async ({ baseURL }) => {
  const admin = adminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email: E2E_EMAIL, password: E2E_PASSWORD, email_confirm: true,
  });
  if (createError && !/already|registered|exists/i.test(createError.message)) throw createError;

  // supabase-js writes the session through `storage`; capture what it writes.
  const written = new Map<string, string>();
  const client = anonClient({
    getItem: (k) => written.get(k) ?? null,
    setItem: (k, v) => { written.set(k, v); },
    removeItem: (k) => { written.delete(k); },
  });
  const { error } = await client.auth.signInWithPassword({
    email: E2E_EMAIL, password: E2E_PASSWORD, options: { captchaToken: TEST_CAPTCHA_TOKEN },
  });
  expect(error).toBeNull();

  const storageKey = `sb-${new URL(supabaseUrl()).hostname.split('.')[0]}-auth-token`;
  const session = written.get(storageKey);
  expect(session, `supabase-js should have stored the session under ${storageKey}`).toBeTruthy();

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    cookies: [],
    origins: [{ origin: new URL(baseURL!).origin, localStorage: [{ name: storageKey, value: session! }] }],
  }, null, 2));
});
