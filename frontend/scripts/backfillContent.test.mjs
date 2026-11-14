import { describe, it, expect, vi } from 'vitest'
import { backfillBatch } from './backfillContent.mjs'

const rows = (n, prefix) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i).padStart(3, '0')}`, content: `md ${i}`, revision: 1 }))

describe('backfillBatch', () => {
  it('walks two pages, asking for the second after the last id of the first', async () => {
    const page1 = rows(100, 'a')
    const page2 = rows(3, 'b')
    const fetchBatch = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2)
    const write = vi.fn().mockResolvedValue(true)
    const result = await backfillBatch({ fetchBatch, parse: async (md) => [{ md }], write, dryRun: false })
    expect(result).toEqual({ scanned: 103, updated: 103, skipped: 0, failed: 0 })
    expect(fetchBatch).toHaveBeenCalledTimes(2)
    expect(fetchBatch).toHaveBeenNthCalledWith(1, null)
    expect(fetchBatch).toHaveBeenNthCalledWith(2, page1[99].id)
    expect(write).toHaveBeenCalledWith(page1[0].id, 1, [{ md: 'md 0' }])
  })

  it('never writes on a dry run', async () => {
    const fetchBatch = vi.fn().mockResolvedValueOnce(rows(3, 'a'))
    const write = vi.fn()
    const result = await backfillBatch({ fetchBatch, parse: async () => [], write, dryRun: true })
    expect(write).not.toHaveBeenCalled()
    expect(result).toEqual({ scanned: 3, updated: 0, skipped: 0, failed: 0 })
  })

  it('counts a row edited meanwhile as skipped', async () => {
    const fetchBatch = vi.fn().mockResolvedValueOnce(rows(2, 'a'))
    const write = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const result = await backfillBatch({ fetchBatch, parse: async () => [], write, dryRun: false })
    expect(result).toEqual({ scanned: 2, updated: 1, skipped: 1, failed: 0 })
  })

  it('counts a write error (permissions, config) as failed, not skipped', async () => {
    const fetchBatch = vi.fn().mockResolvedValueOnce(rows(2, 'a'))
    const write = vi.fn().mockRejectedValueOnce(new Error('permission denied')).mockResolvedValueOnce(true)
    const result = await backfillBatch({ fetchBatch, parse: async () => [], write, dryRun: false })
    expect(result).toEqual({ scanned: 2, updated: 1, skipped: 0, failed: 1 })
  })

  it('counts a parse error as failed and keeps going', async () => {
    const fetchBatch = vi.fn().mockResolvedValueOnce(rows(2, 'a'))
    const parse = vi.fn().mockRejectedValueOnce(new Error('bad')).mockResolvedValueOnce([])
    const write = vi.fn().mockResolvedValue(true)
    const result = await backfillBatch({ fetchBatch, parse, write, dryRun: false })
    expect(result).toEqual({ scanned: 2, updated: 1, skipped: 0, failed: 1 })
    expect(write).toHaveBeenCalledTimes(1)
  })
})
