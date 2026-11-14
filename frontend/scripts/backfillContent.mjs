// Pure logic for the content_json backfill (see backfill-content-json.mjs for the CLI).
// fetchBatch(after) → up to 100 rows { id, content, revision } with content_json null, by id.
// parse(md) → BlockNote blocks. write(id, revision, blocks) → true when the row was updated.
export const BATCH_SIZE = 100

export async function backfillBatch({ fetchBatch, parse, write, dryRun }) {
  const totals = { scanned: 0, updated: 0, skipped: 0, failed: 0 }
  let after = null
  for (;;) {
    const rows = await fetchBatch(after)
    for (const row of rows) {
      totals.scanned += 1
      if (dryRun) continue
      let blocks
      try {
        blocks = await parse(row.content)
      } catch {
        totals.failed += 1
        continue
      }
      // false: the row was edited since we read it; the next run picks it up.
      if (await write(row.id, row.revision, blocks)) totals.updated += 1
      else totals.skipped += 1
    }
    if (rows.length < BATCH_SIZE) return totals
    after = rows[rows.length - 1].id
  }
}
