/* global process */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

/** The e2e user (created by auth.setup.ts on the local stack). */
export const E2E_EMAIL = 'e2e-user@test.local';
export const E2E_PASSWORD = 'e2e-Password-1234!';

/**
 * Cloudflare's always-pass Turnstile token. The local stack's captcha secret
 * (supabase/config.toml, 1x000…AA) is the matching always-pass test secret.
 */
export const TEST_CAPTCHA_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Run the e2e tests against a local stack; see e2e/README.md.`);
  return value;
}

/** The local stack's URL. Refuses anything else: setup creates a user and tests write objects. */
export function supabaseUrl(): string {
  const url = required('VITE_SUPABASE_URL');
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error(`e2e tests only run against a local Supabase stack, not ${url}`);
  }
  return url;
}
const anonKey = () => required('VITE_SUPABASE_ANON_KEY');
const serviceRoleKey = () => required('SUPABASE_SERVICE_ROLE_KEY');

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client: seeds rows and reads what really reached the database. Never ships. */
export function adminClient(): SupabaseClient {
  return createClient(supabaseUrl(), serviceRoleKey(), noSession);
}

export function anonClient(storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }): SupabaseClient {
  return createClient(supabaseUrl(), anonKey(), {
    auth: { persistSession: !!storage, autoRefreshToken: false, storage },
  });
}

let cachedUserId: string | null = null;

export async function e2eUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const { data, error } = await adminClient().from('users').select('id').eq('email', E2E_EMAIL).single();
  if (error) throw error;
  cachedUserId = data.id as string;
  return cachedUserId;
}

/** A fresh object owned by the e2e user, with Markdown content (the editor parses it). */
export async function createObject(title: string, content = 'First line.'): Promise<{ id: string }> {
  const userId = await e2eUserId();
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
  const { data, error } = await adminClient()
    .from('knowledge_objects')
    .insert({ user_id: userId, type: 'note', title, content, slug })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

/** What the database holds now: the trigger-derived plain text of the object's content. */
export async function serverContentText(objectId: string): Promise<string> {
  const { data, error } = await adminClient()
    .from('knowledge_objects')
    .select('content_text')
    .eq('id', objectId)
    .single();
  if (error) throw error;
  return (data.content_text as string | null) ?? '';
}

/** The BlockNote editing surface on the object page. */
export const editorSurface = (page: Page) => page.locator('.blocknote-editor-wrapper [contenteditable="true"]').first();

export const saveIndicator = (page: Page) => page.locator('.save-indicator');

/** Open an object and wait until its editor accepts input. */
export async function openObject(page: Page, objectId: string) {
  await page.goto(`/objects/${objectId}`);
  await expect(editorSurface(page)).toBeVisible();
}

/** Put the cursor at the end of the document and type `text` (no per-key delay). */
export async function typeAtEnd(page: Page, text: string) {
  const surface = editorSurface(page);
  await surface.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

/** A string that can only have come from this test run. */
export const marker = (label: string) => `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
