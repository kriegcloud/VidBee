import { NODE } from './fixtures/node-runtime'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { resolveDownloadTaskKind } from '../src/gallery-dl-executor'
import { isMappedProfilePostUrl, resolveMappedProfileSource } from '../src/mapped-profile-source'
import { SocialProfileManager } from '../src/social-profile-manager'
import { mapVscoProfile } from '../src/vsco-profile-map'

const settled = async (manager: SocialProfileManager, url: string, category: string) => {
  let profile = manager.get(url)
  for (
    let attempt = 0;
    attempt < 40 && profile.categories[category]?.state === 'mapping';
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    profile = manager.get(url)
  }
  return profile
}

test('a VSCO gallery maps to its own post pages', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-vsco-map-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-gallery-dl')
  // gallery-dl writes `[messageType, url, metadata]`; 3 is a URL event.
  await writeFile(
    bin,
    `#!${NODE}
const url = (meta) => console.log(JSON.stringify([3, 'https://image.vsco.co/signed/asset.jpg', meta]));
url({ id: '65A1B2C3D4E5F6', user: 'allybari', video: false, description: 'Golden hour' });
url({ id: 'aa11bb22-cc33', user: 'allybari', video: true, description: '' });
url({ id: '../escape', user: 'allybari', video: false, description: '' });
console.log(JSON.stringify([2, 'ignored-message-type', { id: 'deadbeef' }]));
`,
    { mode: 0o755 }
  )
  const url = 'https://vsco.co/allybari/gallery'
  const source = resolveMappedProfileSource(url)
  assert.equal(source?.platform, 'vsco')
  assert.equal(source?.owner, 'allybari')
  assert.deepEqual(
    source?.categories.map((entry) => entry.key),
    ['gallery']
  )
  // A profile root is the same gallery; a single post is not a profile.
  assert.equal(resolveMappedProfileSource('https://vsco.co/allybari')?.profileUrl, url)
  assert.equal(resolveMappedProfileSource('https://vsco.co/allybari/media/65a1b2c3d4e5f6'), null)

  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin }
  })
  manager.map(url, 'gallery')
  const profile = await settled(manager, url, 'gallery')
  assert.equal(profile.categories.gallery?.state, 'complete')
  assert.deepEqual(profile.categories.gallery?.items, [
    {
      id: '65A1B2C3D4E5F6',
      url: 'https://vsco.co/allybari/media/65a1b2c3d4e5f6',
      author: 'allybari',
      title: 'Golden hour',
      images: 1,
      videos: 0
    },
    {
      id: 'aa11bb22-cc33',
      url: 'https://vsco.co/allybari/video/aa11bb22-cc33',
      author: 'allybari',
      images: 0,
      videos: 1
    }
  ])
})

test('mapped VSCO posts stay on the gallery-dl route', () => {
  for (const post of [
    'https://vsco.co/allybari/media/65a1b2c3d4e5f6',
    'https://vsco.co/allybari/video/aa11bb22-cc33'
  ]) {
    assert.equal(isMappedProfilePostUrl('vsco', post), true)
    assert.equal(resolveDownloadTaskKind(post, 'video'), 'vsco-gallery')
  }
  // Non-canonical and non-post URLs cannot be queued as saved posts.
  assert.equal(
    isMappedProfilePostUrl('vsco', 'https://vsco.co/allybari/media/65A1B2C3D4E5F6'),
    false
  )
  assert.equal(isMappedProfilePostUrl('vsco', 'https://vsco.co/allybari/gallery'), false)
  assert.equal(isMappedProfilePostUrl('vsco', 'https://image.vsco.co/signed/asset.jpg'), false)
})

test('an empty VSCO response suggests refreshing the session without declaring the gallery private', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-vsco-empty-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-gallery-dl')
  await writeFile(
    bin,
    `#!${NODE}
console.log(JSON.stringify([2, { user: 'public-profile', category: 'vsco', subcategory: 'gallery' }]));
`,
    { mode: 0o755 }
  )
  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin }
  })
  const url = 'https://vsco.co/public-profile/gallery'
  manager.map(url, 'gallery')
  const profile = await settled(manager, url, 'gallery')
  const gallery = profile.categories.gallery
  assert.equal(gallery?.state, 'partial')
  assert.equal(gallery?.items.length, 0)
  assert.match(gallery?.error ?? '', /VSCO returned no posts/)
  assert.match(gallery?.error ?? '', /choose that browser for cookies in Settings/)
  assert.match(gallery?.error ?? '', /import fresh VSCO cookies/)
  assert.doesNotMatch(gallery?.error ?? '', /profile is public|private|re-read/)
})

/**
 * A fake gallery-dl that answers with a Cloudflare challenge for the first
 * `challenges` runs, then lists one post. Each run appends its argv to a log.
 */
const challengeThenPosts = async (root: string, challenges: number) => {
  const bin = path.join(root, 'fake-gallery-dl')
  const runs = path.join(root, 'runs.log')
  await writeFile(
    bin,
    `#!${NODE}
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(runs)}, JSON.stringify(process.argv.slice(2)) + '\\n');
const run = fs.readFileSync(${JSON.stringify(runs)}, 'utf8').trim().split('\\n').length;
console.log(JSON.stringify([2, { user: 'allybari', category: 'vsco', subcategory: 'gallery' }]));
if (run <= ${challenges}) {
  console.error('[vsco][warning] Cloudflare challenge');
} else {
  console.log(JSON.stringify([3, 'https://image.vsco.co/a.jpg', { id: '65a1b2c3d4e5f6', video: false }]));
}
`,
    { mode: 0o755 }
  )
  const runCount = async () =>
    (await readFile(runs, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[])
  return { bin, runCount }
}

const braveRuntime = (bin: string) => ({
  resolveGalleryDlPath: () => bin,
  resolveYtDlpPath: () => bin,
  resolveGalleryDlArgs: () => [
    '--cookies-from-browser',
    'brave:/home/user/.config/BraveSoftware/Brave-Browser/Default'
  ]
})

test('a VSCO Cloudflare challenge is retried with a fresh read of the browser cookies', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-vsco-refresh-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const { bin, runCount } = await challengeThenPosts(root, 1)
  const items: string[] = []
  const result = await mapVscoProfile(
    'https://vsco.co/allybari/gallery',
    'allybari',
    braveRuntime(bin),
    { browserForCookies: 'brave:/home/user/.config/BraveSoftware/Brave-Browser/Default' },
    new AbortController().signal,
    (item) => items.push(item.id),
    { cookieRefreshDelaysMs: [0, 0] }
  )
  assert.deepEqual(result, { complete: true, error: undefined })
  assert.deepEqual(items, ['65a1b2c3d4e5f6'])
  const runs = await runCount()
  assert.equal(runs.length, 2)
  // Every run asks gallery-dl to extract the browser cookies again.
  for (const argv of runs) {
    assert.ok(argv.includes('--cookies-from-browser'))
  }
})

test('a persistent VSCO Cloudflare challenge asks for the gallery to be opened in the cookie browser', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-vsco-challenge-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const { bin, runCount } = await challengeThenPosts(root, 99)
  const result = await mapVscoProfile(
    'https://vsco.co/allybari/gallery',
    'allybari',
    braveRuntime(bin),
    { browserForCookies: 'brave+kwallet:/home/user/.config/BraveSoftware/Brave-Browser/Default' },
    new AbortController().signal,
    () => assert.fail('A challenged map must not emit posts'),
    { cookieRefreshDelaysMs: [0, 0] }
  )
  assert.equal(result.complete, false)
  assert.equal(result.authRequired, true)
  assert.match(result.error ?? '', /Cloudflare check/)
  assert.match(result.error ?? '', /re-read Brave cookies 2 times/)
  assert.match(result.error ?? '', /Open https:\/\/vsco\.co\/allybari\/gallery in Brave/)
  assert.equal((await runCount()).length, 3)
})

test('a VSCO Cloudflare challenge marks the saved gallery as needing sign-in', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-vsco-auth-state-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const { bin, runCount } = await challengeThenPosts(root, 99)
  // Without browser cookies a rerun cannot change the answer, so none happens.
  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin, resolveExtraArgs: () => [] }
  })
  const url = 'https://vsco.co/allybari/gallery'
  manager.map(url, 'gallery')
  const gallery = (await settled(manager, url, 'gallery')).categories.gallery
  assert.equal(gallery?.state, 'auth-required')
  assert.match(gallery?.error ?? '', /Choose your browser for cookies in Settings/)
  assert.equal((await runCount()).length, 1)
})

test('stopping a VSCO map during a cookie refresh wait ends it without another run', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-vsco-abort-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const { bin, runCount } = await challengeThenPosts(root, 99)
  const controller = new AbortController()
  const mapping = mapVscoProfile(
    'https://vsco.co/allybari/gallery',
    'allybari',
    braveRuntime(bin),
    undefined,
    controller.signal,
    () => assert.fail('A challenged map must not emit posts'),
    { cookieRefreshDelaysMs: [60_000] }
  )
  // Abort once the first run has finished and the refresh wait has begun.
  for (let attempt = 0; attempt < 200; attempt++) {
    const done = await runCount().catch(() => [])
    if (done.length === 1) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  await new Promise((resolve) => setTimeout(resolve, 100))
  controller.abort()
  assert.deepEqual(await mapping, { complete: false })
  assert.equal((await runCount()).length, 1)
})

test('VSCO extractor failures retain the underlying error instead of reporting an empty gallery', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-vsco-error-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-gallery-dl')
  await writeFile(
    bin,
    `#!${NODE}
console.error('HTTP 429: Too Many Requests');
process.exitCode = 1;
`,
    { mode: 0o755 }
  )
  const result = await mapVscoProfile(
    'https://vsco.co/public-profile/gallery',
    'public-profile',
    { resolveGalleryDlPath: () => bin, resolveYtDlpPath: () => bin },
    undefined,
    new AbortController().signal,
    () => assert.fail('A failed extractor must not emit posts')
  )
  assert.equal(result.complete, false)
  assert.equal(result.error, 'HTTP 429: Too Many Requests')
})

test('VSCO site routes are not read as usernames', () => {
  for (const route of [
    'https://vsco.co/spaces',
    'https://vsco.co/discover',
    'https://vsco.co/search'
  ]) {
    assert.equal(resolveMappedProfileSource(route), null)
    assert.equal(resolveDownloadTaskKind(route, 'video'), 'video')
  }
})
