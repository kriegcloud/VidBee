import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { MemoryPersistAdapter } from '@vidbee/task-queue-legacy/persist'
import { enqueueInstagramProfileDownload, InstagramProfileInspector, restoreInstagramProfileGroupCaps } from '@vidbee/downloader-core'
import { downloadSocialMedia, inspectSocialMedia, restoreSocialMediaGroupCaps } from '@vidbee/downloader-core/social-media-service'
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function queue() { return new TaskQueueAPI({ persist: new MemoryPersistAdapter(), executor: { run: () => ({ cancel: async () => {}, pause: async () => {} }) }, idleQueueKickMs: 0 }) }
async function inspection() {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-enqueue-')); roots.push(dir)
  const api = new InstagramProfileInspector({ storageDir: dir, resolveBinaryPath: () => 'unused', clock: () => 1000 })
  const initial = await api.inspect('https://instagram.com/fixture', undefined, [])
  const target = join(dir, `${initial.inspectionId}.json`); const saved = JSON.parse(readFileSync(target, 'utf8'))
  saved.categories = ['posts', 'reels', 'highlights'].map((category) => ({ category, state: 'ready', sourceCount: 1, assetCount: 2, items: [{ id: `${category}-one`, url: 'https://www.instagram.com/p/ONE/', assetCount: 2 }] }))
  writeFileSync(target, JSON.stringify(saved))
  return { api: new InstagramProfileInspector({ storageDir: dir, resolveBinaryPath: () => 'unused', clock: () => 1000 }), id: initial.inspectionId }
}
it('Instagram enqueue cap/get/add/settlement microtasks and exact task payload, categories ordered and deduplicated', async () => {
  const q = queue(); const { api, id } = await inspection(); const trace: unknown[] = []
  vi.spyOn(q, 'setMaxPerGroup').mockImplementation(async (...args) => { trace.push(['cap', ...args]) })
  vi.spyOn(q, 'get').mockImplementation((id) => { trace.push(['get', id]); return undefined })
  vi.spyOn(q, 'add').mockImplementation(async (request) => { trace.push(['add', request]); return { id: request.id ?? 'generated' } })
  const pending = enqueueInstagramProfileDownload({ queue: q, inspector: api, input: { inspectionId: id, categories: ['highlights', 'posts', 'posts'], settings: { proxy: 'http://proxy.invalid' } }, defaultDownloadDir: '/fixture/out', batch: { id: 'batch', title: 'Batch' } })
  trace.push('returned'); queueMicrotask(() => trace.push('microtask'))
  const result = await pending; trace.push(['settled', result]); expect(trace).toMatchSnapshot()
})
it('Instagram expired and category-not-ready rejects before queue mutation; invalid inspector URL retains errors', async () => {
  const q = queue(); const { api, id } = await inspection(); const cap = vi.spyOn(q, 'setMaxPerGroup')
  await expect(enqueueInstagramProfileDownload({ queue: q, inspector: api, input: { inspectionId: 'missing', categories: [] }, defaultDownloadDir: '/fixture' })).rejects.toThrow('Instagram profile inspection expired. Scan the profile again.')
  await expect(enqueueInstagramProfileDownload({ queue: q, inspector: api, input: { inspectionId: id, categories: ['stories'] }, defaultDownloadDir: '/fixture' })).rejects.toThrow('Instagram category "stories" is not ready to download.')
  expect(cap).not.toHaveBeenCalled(); expect(() => api.cancel('invalid')).toThrow('Enter a valid Instagram profile URL.'); await expect(api.inspect('invalid')).rejects.toThrow('Enter a valid Instagram profile URL.')
})
it('Instagram enqueue propagates non-Error queue rejection by identity', async () => {
  const q = queue(); const { api, id } = await inspection(); const failure = { queue: 'failure' }
  vi.spyOn(q, 'setMaxPerGroup').mockImplementation(() => Promise.reject(failure))
  await expect(enqueueInstagramProfileDownload({ queue: q, inspector: api, input: { inspectionId: id, categories: ['posts'] }, defaultDownloadDir: '/fixture' })).rejects.toBe(failure)
})
it('social download exact task payload and Promise markers; duplicate category order and restore caps', async () => {
  const q = queue(); const trace: unknown[] = []
  vi.spyOn(q, 'setMaxPerGroup').mockImplementation(async (...args) => { trace.push(['cap', ...args]) })
  vi.spyOn(q, 'add').mockImplementation(async (request) => { trace.push(['add', request]); return { id: 'added' } })
  const pending = downloadSocialMedia(q, { url: 'https://x.com/fixture', categories: ['tweets', 'tweets'], options: { media: 'images' }, customDownloadPath: '/fixture/out' }, { id: 'batch', title: 'Batch', order: 2 })
  trace.push('returned'); queueMicrotask(() => trace.push('microtask')); trace.push(['settled', await pending]); await restoreSocialMediaGroupCaps(q)
  expect(trace).toMatchSnapshot()
})
it('social invalid source/category errors precede enqueue; restore Instagram scans pages synchronously before awaiting caps', async () => {
  const q = queue(); const cap = vi.spyOn(q, 'setMaxPerGroup').mockResolvedValue(); const list = vi.spyOn(q, 'list').mockReturnValue({ tasks: [], nextCursor: null })
  await expect(inspectSocialMedia('https://fixture.invalid')).rejects.toThrow('This social media URL is not supported. Use a post, profile, or supported collection URL.')
  await expect(downloadSocialMedia(q, { url: 'https://x.com/fixture', categories: ['invalid'] })).rejects.toThrow('Unsupported collection category: invalid')
  expect(cap).not.toHaveBeenCalled(); const pending = restoreInstagramProfileGroupCaps(q); expect(list).toHaveBeenCalledWith({ limit: 200, cursor: null }); await pending
})

function savedTask(id: string, status: import('@vidbee/task-queue-legacy').Task['status'], groupKey = 'instagram-profile'): import('@vidbee/task-queue-legacy').Task {
  return { id, kind: 'instagram-profile-category', parentId: null, input: { kind: 'instagram-profile-category', url: 'https://instagram.com/p/ONE/', options: { previous: true } }, priority: 0, groupKey, status, prevStatus: null, statusReason: null, enteredStatusAt: 1, attempt: 1, maxAttempts: 3, nextRetryAt: null, progress: { percent: 0, bytesDownloaded: null, bytesTotal: null, speedBps: null, etaMs: null, ticks: 0 }, output: null, lastError: null, pid: null, pidStartedAt: null, createdAt: 1, updatedAt: 1 }
}
for (const status of ['failed', 'cancelled', 'queued', 'completed'] as const) it(`Instagram existing ${status} task retry/add order and identity`, async () => {
  const q = queue(); const { api, id } = await inspection(); const trace: unknown[] = []
  vi.spyOn(q, 'setMaxPerGroup').mockResolvedValue()
  vi.spyOn(q, 'get').mockImplementation((key) => savedTask(key, status))
  vi.spyOn(q, 'retryManual').mockImplementation(async (...args) => { trace.push(['retry', ...args]) })
  vi.spyOn(q, 'add').mockImplementation(async (request) => { trace.push(['add', request.id]); return { id: request.id ?? 'generated' } })
  const result = await enqueueInstagramProfileDownload({ queue: q, inspector: api, input: { inspectionId: id, categories: ['posts'], settings: { proxy: 'http://proxy.invalid' } }, defaultDownloadDir: '/fixture/out', batch: { id: 'batch', title: 'Batch' } })
  if (status === 'failed' || status === 'cancelled') { expect(trace.map((entry) => Array.isArray(entry) ? entry[0] : entry)).toEqual(['retry', 'add']); expect(trace[0]).toEqual(['retry', result.tasks[0]?.downloadId, { previous: true, settings: { proxy: 'http://proxy.invalid' } }]) }
  else { expect(trace).toEqual([]); expect(result.tasks).toEqual([]) }
})
it('Instagram restore paginates synchronously, deduplicates group keys, then awaits caps in insertion order', async () => {
  const q = queue(); const trace: unknown[] = []
  vi.spyOn(q, 'list').mockImplementation((options) => { trace.push(['list', options]); return options?.cursor ? { tasks: [savedTask('two', 'queued', 'b'), savedTask('three', 'queued', 'a')], nextCursor: null } : { tasks: [savedTask('one', 'queued', 'a')], nextCursor: 'next' } })
  vi.spyOn(q, 'setMaxPerGroup').mockImplementation(async (...args) => { trace.push(['cap', ...args]) })
  const pending = restoreInstagramProfileGroupCaps(q); trace.push('returned'); queueMicrotask(() => trace.push('marker')); await pending
  expect(trace).toEqual([['list', { limit: 200, cursor: null }], ['list', { limit: 200, cursor: 'next' }], ['cap', 'a', 1], 'returned', ['cap', 'b', 1], 'marker'])
})
