import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TaskQueueAPI } from '@vidbee/task-queue'
import {
  enqueueInstagramProfileDownload,
  InstagramProfileInspector
} from '../src/instagram-profile'

test('JSON inspection distinguishes extractor exceptions from empty categories', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-instagram-inspection-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const script = join(dir, 'gallery.cjs')
  writeFileSync(
    script,
    `
const url=process.argv.at(-1)
const result=url.includes('/info/')?[[2,{username:'fixture'}]]:
url.includes('/posts/')?[[-1,{error:'AbortExtraction',message:'HTTP redirect to login page'}]]:
url.includes('/reels/')?[[2,{post_id:'one'}],[3,'https://example.com/video.mp4',{post_id:'one'}],[-1,{error:'HttpError',message:'429 Too Many Requests'}]]:[]
console.log(JSON.stringify(result))
`
  )
  // A tiny launcher absorbs gallery-dl's flags, passing only the URL to Node.
  const launcher = join(dir, 'gallery')
  writeFileSync(
    launcher,
    `#!/usr/bin/env node\nrequire('node:child_process').spawnSync(process.execPath,[${JSON.stringify(script)},process.argv.at(-1)],{stdio:'inherit'})\n`,
    { mode: 0o755 }
  )
  const actual = new InstagramProfileInspector({
    resolveBinaryPath: () => launcher,
    resolveExtraArgs: () => []
  })
  const result = await actual.inspect('https://www.instagram.com/fixture/')
  assert.equal(result.complete, false)
  assert.equal(result.categories.find((x) => x.category === 'posts')?.state, 'auth-required')
  assert.equal(result.categories.find((x) => x.category === 'reels')?.errorCode, 'rate-limited')
  assert.equal(result.categories.find((x) => x.category === 'reels')?.assetCount, 1)
  assert.equal(result.categories.find((x) => x.category === 'stories')?.state, 'empty')
})

test('concurrent profile scans share duplicate requests and serialize different profiles', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-instagram-concurrency-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const log = join(dir, 'calls.jsonl')
  const launcher = join(dir, 'gallery')
  writeFileSync(
    launcher,
    `#!/usr/bin/env node
require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.at(-1))+'\\n')
console.log('[]')
`,
    { mode: 0o755 }
  )
  const inspector = new InstagramProfileInspector({ resolveBinaryPath: () => launcher })
  const [first, duplicate, second] = await Promise.all([
    inspector.inspect('https://instagram.com/first/'),
    inspector.inspect('https://www.instagram.com/first/?source=share'),
    inspector.inspect('https://instagram.com/second/')
  ])
  assert.equal(first.inspectionId, duplicate.inspectionId)
  assert.notEqual(first.inspectionId, second.inspectionId)
  const calls = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as string)
  assert.equal(calls.length, 10)
  assert.ok(calls.slice(0, 5).every((url) => url.includes('/first/')))
  assert.ok(calls.slice(5).every((url) => url.includes('/second/')))
})

test('mapped references survive restart and failed refresh, and queue incrementally', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-instagram-saved-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const storageDir = join(dir, 'profiles')
  const launcher = join(dir, 'gallery')
  const messages = [
    [
      3,
      'https://temporary.invalid/photo1?token=temporary',
      { post_id: 'one', post_url: 'https://www.instagram.com/p/ONE/', media_id: '1' }
    ],
    [
      3,
      'https://temporary.invalid/video2?token=temporary',
      { post_id: 'one', post_url: 'https://www.instagram.com/p/ONE/', media_id: '2' }
    ],
    [
      3,
      'https://temporary.invalid/photo3?token=temporary',
      { post_id: 'two', post_url: 'https://www.instagram.com/p/TWO/', media_id: '3' }
    ]
  ]
  writeFileSync(
    launcher,
    `#!/usr/bin/env node\nconsole.log(${JSON.stringify(JSON.stringify(messages))})\n`,
    { mode: 0o755 }
  )
  const inspector = new InstagramProfileInspector({ storageDir, resolveBinaryPath: () => launcher })
  const first = await inspector.inspect('https://www.instagram.com/fixture/posts/', undefined, [
    'posts'
  ])
  const posts = first.categories.find((entry) => entry.category === 'posts')
  assert.ok(posts?.items)
  const [firstItem, secondItem] = posts.items
  assert.ok(firstItem && secondItem)
  assert.equal(posts.items?.length, 2)
  assert.equal(posts.items?.[0].assetCount, 2)
  assert.equal(
    first.categories.find((entry) => entry.category === 'highlights')?.state,
    'unscanned'
  )
  const disk = readFileSync(join(storageDir, `${first.inspectionId}.json`), 'utf8')
  assert.ok(!disk.includes('temporary.invalid'))
  assert.ok(!disk.includes('token='))
  const restarted = new InstagramProfileInspector({
    storageDir,
    clock: () => Date.now() + 365 * 24 * 60 * 60 * 1000,
    resolveBinaryPath: () => {
      throw new Error('A saved profile must not require a network scan')
    }
  })
  const restored = await restarted.inspect('https://instagram.com/fixture', undefined, [])
  assert.deepEqual(
    JSON.parse(JSON.stringify(restored.categories)),
    JSON.parse(JSON.stringify(first.categories))
  )
  writeFileSync(
    launcher,
    `#!/usr/bin/env node\nconsole.log(JSON.stringify([[-1,{error:'AuthRequired',message:'Login required'}]]))\n`,
    { mode: 0o755 }
  )
  const refreshed = await inspector.inspect('https://instagram.com/fixture', undefined, ['posts'])
  assert.equal(
    refreshed.categories.find((entry) => entry.category === 'posts')?.state,
    'auth-required'
  )
  assert.deepEqual(
    refreshed.categories.find((entry) => entry.category === 'posts')?.items,
    posts.items
  )

  const entries = new Map<string, { id: string; status: string; input: unknown }>()
  let retriedSettings: unknown
  const queue = {
    retryManual: async (id: string, options: { settings?: unknown }) => {
      retriedSettings = options.settings
      const entry = entries.get(id)
      assert.ok(entry)
      entry.status = 'queued'
    },
    setMaxPerGroup: async () => {},
    get: (id: string) => entries.get(id),
    add: async (request: { id: string; input: unknown }) => {
      entries.set(request.id, { id: request.id, status: 'queued', input: request.input })
      return { id: request.id }
    }
  } as unknown as TaskQueueAPI
  const request = {
    queue,
    inspector: restarted,
    defaultDownloadDir: dir,
    input: {
      inspectionId: first.inspectionId,
      categories: ['posts'] as const,
      itemIds: [firstItem.id]
    }
  }
  const firstBatch = await enqueueInstagramProfileDownload({
    ...request,
    input: { ...request.input, categories: ['posts'] }
  })
  assert.equal(firstBatch.tasks.length, 1)
  assert.equal(firstBatch.totalAssetCount, 2)
  const duplicate = await enqueueInstagramProfileDownload({
    ...request,
    input: { ...request.input, categories: ['posts'] }
  })
  assert.equal(duplicate.tasks.length, 0)
  const nextBatch = await enqueueInstagramProfileDownload({
    ...request,
    input: { ...request.input, categories: ['posts'], itemIds: [secondItem.id] }
  })
  assert.equal(nextBatch.tasks.length, 1)
  assert.equal(entries.size, 2)
  const failed = entries.get(firstBatch.tasks[0].downloadId)
  assert.ok(failed)
  failed.status = 'failed'
  const settings = { browserForCookies: 'firefox' }
  const retry = await enqueueInstagramProfileDownload({
    ...request,
    input: { ...request.input, categories: ['posts'], settings }
  })
  assert.equal(retry.tasks.length, 1)
  assert.deepEqual(retriedSettings, settings)
  assert.equal(entries.size, 2)
  const completedInspector = new InstagramProfileInspector({
    storageDir,
    resolveBinaryPath: () => launcher,
    completedDownloads: () => [{ url: firstItem.url, category: 'posts', assetCount: 2 }]
  })
  const completedSnapshot = await completedInspector.inspect(
    'https://instagram.com/fixture/',
    undefined,
    []
  )
  assert.equal(
    completedSnapshot.categories.find((entry) => entry.category === 'posts')?.items?.[0].downloaded,
    true
  )
  const library = new InstagramProfileInspector({
    storageDir,
    resolveBinaryPath: () => {
      throw new Error('Listing saved profiles must not launch a scan')
    }
  })
  assert.equal(library.list()[0].profile.username, 'fixture')
  const reopenedSnapshot = await library.inspect('https://instagram.com/fixture/', undefined, [])
  assert.equal(
    reopenedSnapshot.categories.find((entry) => entry.category === 'posts')?.items?.[0].downloaded,
    true
  )
})

test('stopping a map kills extraction, saves discovered images and videos, and allows retry', {
  timeout: 5000
}, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-instagram-stop-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const launcher = join(dir, 'gallery')
  const started = join(dir, 'pid')
  const records = [
    [
      3,
      '',
      {
        post_id: 'one',
        post_url: 'https://www.instagram.com/p/ONE/',
        media_id: '1',
        extension: 'jpg'
      }
    ],
    [
      3,
      '',
      {
        post_id: 'one',
        post_url: 'https://www.instagram.com/p/ONE/',
        media_id: '2',
        extension: 'mp4'
      }
    ]
  ]
  writeFileSync(
    launcher,
    `#!/usr/bin/env node
const fs = require('node:fs')
for (const record of ${JSON.stringify(records)}) process.stderr.write('VIDBEE_MAP:'+JSON.stringify(record)+'\\n')
fs.writeFileSync(${JSON.stringify(started)}, String(process.pid))
setInterval(()=>{},1000)
`,
    { mode: 0o755 }
  )
  const inspector = new InstagramProfileInspector({
    storageDir: join(dir, 'profiles'),
    resolveBinaryPath: () => launcher
  })
  t.after(() => inspector.cancel('https://instagram.com/fixture/'))
  const pending = inspector.inspect('https://instagram.com/fixture/', undefined, ['posts', 'reels'])
  let pid: number | undefined
  while (!pid) {
    try {
      pid = Number(readFileSync(started, 'utf8'))
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  // A queued profile can stop immediately without waiting for this running child.
  const queued = inspector.inspect('https://instagram.com/queued/', undefined, ['posts'])
  assert.equal(inspector.cancel('https://instagram.com/queued/'), true)
  await queued
  assert.doesNotThrow(() => process.kill(pid, 0))
  assert.equal(inspector.cancel('https://instagram.com/fixture/posts/'), true)
  const stopped = await pending
  assert.throws(() => process.kill(pid, 0))
  const posts = stopped.categories.find((category) => category.category === 'posts')
  assert.equal(posts?.state, 'cancelled')
  assert.equal(posts?.items?.[0].assetCount, 2)
  assert.equal(
    stopped.categories.find((category) => category.category === 'reels')?.state,
    'unscanned'
  )
  const reopened = new InstagramProfileInspector({
    storageDir: join(dir, 'profiles'),
    resolveBinaryPath: () => launcher
  })
  assert.equal(
    (await reopened.inspect('https://instagram.com/fixture/', undefined, [])).totalAssetCount,
    2
  )
  writeFileSync(
    launcher,
    `#!/usr/bin/env node\nconsole.log(${JSON.stringify(JSON.stringify(records))})\n`,
    { mode: 0o755 }
  )
  const resumed = await inspector.inspect('https://instagram.com/fixture/', undefined, ['posts'])
  assert.equal(resumed.categories.find((category) => category.category === 'posts')?.state, 'ready')
  assert.equal(resumed.totalAssetCount, 2)
  assert.equal(inspector.cancel('https://instagram.com/fixture/'), false)
})

test('every Instagram category preserves image and video references without media filters', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vidbee-instagram-media-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const launcher = join(dir, 'gallery')
  writeFileSync(
    launcher,
    `#!/usr/bin/env node
if (process.argv.includes('--filter')) process.exit(1)
const records=[[3,'https://cdn.invalid/image.jpg',{post_id:'image',post_url:'https://www.instagram.com/p/IMAGE/',extension:'jpg'}],[3,'https://cdn.invalid/video.mp4',{post_id:'video',post_url:'https://www.instagram.com/reel/VIDEO/',extension:'mp4'}]]
for (const record of records) process.stderr.write('VIDBEE_MAP:'+JSON.stringify(record)+'\\n')
console.log(JSON.stringify(records))
`,
    { mode: 0o755 }
  )
  const inspector = new InstagramProfileInspector({ resolveBinaryPath: () => launcher })
  const mapped = await inspector.inspect('https://instagram.com/fixture/')
  for (const category of mapped.categories) {
    assert.equal(category.state, 'ready')
    assert.equal(category.assetCount, 2, 'Streamed records must not be counted twice')
    assert.equal(category.items?.length, 2)
  }
  const queued: { input: { url: string; options: Record<string, unknown> } }[] = []
  const queue = {
    setMaxPerGroup: async () => {},
    get: () => undefined,
    add: async (request: {
      id: string
      input: { url: string; options: Record<string, unknown> }
    }) => {
      queued.push(request)
      return { id: request.id }
    }
  } as unknown as TaskQueueAPI
  await enqueueInstagramProfileDownload({
    queue,
    inspector,
    defaultDownloadDir: dir,
    input: {
      inspectionId: mapped.inspectionId,
      categories: mapped.categories.map((c) => c.category)
    }
  })
  assert.equal(queued.length, 10)
  assert.equal(queued.filter((task) => task.input.url.endsWith('/IMAGE/')).length, 5)
  assert.ok(queued.every((task) => task.input.options.galleryDlFilter === undefined))
})
