/* global process */
// Owner-run, after the 2b deploy: fill knowledge_objects.content_json from Markdown.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run backfill:content -- --dry-run
// Idempotent and revision-safe: a row edited meanwhile is skipped and picked up next run.
// Re-run until `updated` is 0. backfill_object_content_json keeps revision and updated_at,
// so open editors see no false conflict.
import { createClient } from '@supabase/supabase-js'
import { ServerBlockNoteEditor } from '@blocknote/server-util'
import { backfillBatch, BATCH_SIZE } from './backfillContent.mjs'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const dryRun = process.argv.includes('--dry-run')

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const editor = ServerBlockNoteEditor.create()

async function fetchBatch(after) {
  let q = db
    .from('knowledge_objects')
    .select('id, content, revision')
    .is('content_json', null)
    .not('content', 'is', null)
    .order('id')
    .limit(BATCH_SIZE)
  if (after) q = q.gt('id', after)
  const { data, error } = await q
  if (error) throw error
  return data
}

async function write(id, revision, blocks) {
  const { data, error } = await db.rpc('backfill_object_content_json', {
    p_id: id, p_revision: revision, p_content_json: blocks,
  })
  if (error) {
    console.error(`Row ${id}: ${error.message}`)
    return false
  }
  return data === true
}

const totals = await backfillBatch({
  fetchBatch,
  parse: (md) => editor.tryParseMarkdownToBlocks(md),
  write,
  dryRun,
})
console.log(`${dryRun ? '[dry run] ' : ''}scanned ${totals.scanned}, updated ${totals.updated}, `
  + `skipped ${totals.skipped}, failed ${totals.failed}`)
