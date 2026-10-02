import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TaskQueueAPI } from '@vidbee/task-queue'
import {
  downloadSocialMedia,
  mapSocialMediaProfile,
  type SocialMappedItem
} from '../src/social-media-service'
import { SocialProfileManager } from '../src/social-profile-manager'

test('social mapping retains post references without accepting media URLs', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-social-map-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-gallery')
  await writeFile(
    bin,
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const raw = process.argv.find((arg) => arg.startsWith('extractor.vidbee-social.destination='));
const destination = JSON.parse(raw.slice(raw.indexOf('=') + 1));
const manifest = path.join(destination, '.vidbee', 'social-media.sqlite');
fs.mkdirSync(path.dirname(manifest), { recursive: true });
fs.writeFileSync(manifest, 'manifest');
const emit = (value) => process.stdout.write('__VIDBEE_SOCIAL__\\t' + JSON.stringify(value) + '\\n');
emit({ type: 'item', item: { id: '123456789', url: 'https://x.com/i/web/status/123456789', author: 'fixture', kind: 'image' } });
emit({ type: 'item', item: { id: '123456789', url: 'https://cdn.example/secret.jpg', author: 'fixture', kind: 'image' } });
emit({ type: 'complete', summary: { posts: 1, images: 1, videos: 0, downloaded: 0, existing: 0, failed: 0, totalSize: 0, reason: 'exhausted', manifestPath: manifest, startedAt: 1, finishedAt: 2 } });
`,
    { mode: 0o755 }
  )
  const items: SocialMappedItem[] = []
  const result = await mapSocialMediaProfile(
    'https://x.com/fixture/tweets',
    { resolveBinaryPath: () => bin },
    undefined,
    new AbortController().signal,
    (item) => items.push(item)
  )
  assert.deepEqual(result, { complete: true })
  assert.equal(items.length, 1)
  assert.equal(items[0]?.url, 'https://x.com/i/web/status/123456789')

  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin }
  })
  assert.ok(
    ['mapping', 'complete'].includes(
      manager.map('https://x.com/fixture', 'tweets').categories.tweets?.state ?? ''
    )
  )
  let saved = manager.get('https://x.com/fixture')
  for (let attempt = 0; attempt < 40 && saved.categories.tweets?.state === 'mapping'; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    saved = manager.get('https://x.com/fixture')
  }
  assert.equal(saved.categories.tweets?.state, 'complete')
  assert.equal(saved.categories.tweets?.items.length, 1)
  assert.equal(saved.categories.tweets?.items[0]?.images, 1)
  manager.map('https://x.com/fixture', 'tweets')
  for (let attempt = 0; attempt < 40; attempt++) {
    saved = manager.get('https://x.com/fixture')
    if (saved.categories.tweets?.state !== 'mapping') {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(saved.categories.tweets?.items[0]?.images, 1)
  assert.equal(manager.list()[0]?.owner, 'fixture')
})

test('X mapping reports an empty traversal and rejected browser cookies instead of ready', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-x-map-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-gallery')
  await writeFile(
    bin,
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const raw = process.argv.find((arg) => arg.startsWith('extractor.vidbee-social.destination='));
const destination = JSON.parse(raw.slice(raw.indexOf('=') + 1));
const manifest = path.join(destination, '.vidbee', 'social-media.sqlite');
fs.mkdirSync(path.dirname(manifest), { recursive: true });
fs.writeFileSync(manifest, 'manifest');
console.log('__VIDBEE_SOCIAL__\\t' + JSON.stringify({ type: 'complete', summary: { posts: 0, images: 0, videos: 0, downloaded: 0, existing: 0, failed: 0, totalSize: 0, reason: 'exhausted', manifestPath: manifest, startedAt: 1, finishedAt: 2 } }));
`,
    { mode: 0o755 }
  )
  const options = { resolveBinaryPath: () => bin }
  const signal = new AbortController().signal
  const empty = await mapSocialMediaProfile(
    'https://x.com/fixture/tweets',
    options,
    undefined,
    signal,
    () => {}
  )
  assert.equal(empty.complete, false)
  assert.match(empty.error ?? '', /no downloadable posts/i)

  await writeFile(
    bin,
    `#!${process.execPath}
process.stderr.write("[twitter][error] 'Could not authenticate you'\\n");
process.exit(4);
`,
    { mode: 0o755 }
  )
  const rejected = await mapSocialMediaProfile(
    'https://x.com/fixture/tweets',
    options,
    undefined,
    signal,
    () => {}
  )
  assert.equal(rejected.complete, false)
  assert.match(rejected.error ?? '', /AuthRequired/)
})

test('selected social profile posts share one batch with their original order', async () => {
  const options: Record<string, unknown>[] = []
  const queue = {
    setMaxPerGroup: async () => {},
    add: async ({ input }: { input: { options?: Record<string, unknown> } }) => {
      options.push(input.options ?? {})
      return { id: `task-${options.length}` }
    }
  } as unknown as TaskQueueAPI
  const batch = { id: 'profile-batch', title: '@fixture', order: 0 }

  await downloadSocialMedia(
    queue,
    { url: 'https://www.tiktok.com/@fixture/video/123456789' },
    batch
  )
  await downloadSocialMedia(
    queue,
    { url: 'https://www.tiktok.com/@fixture/video/987654321' },
    { ...batch, order: 1 }
  )

  assert.deepEqual(options.map((entry) => entry.batchId), ['profile-batch', 'profile-batch'])
  assert.deepEqual(options.map((entry) => entry.batchOrder), [0, 1])
  assert.deepEqual(options.map((entry) => entry.batchTitle), ['@fixture', '@fixture'])
})
