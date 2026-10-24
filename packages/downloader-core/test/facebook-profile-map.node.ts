import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { isMappedProfilePostUrl, resolveMappedProfileSource } from '../src/mapped-profile-source'
import { SocialProfileManager } from '../src/social-profile-manager'

const profile = 'https://www.facebook.com/sydney.schlachter.5'

test('Facebook profile routes map photos, albums, and reels without claiming individual posts', () => {
  assert.deepEqual(
    resolveMappedProfileSource(profile)?.categories.map((category) => category.key),
    ['photos', 'albums', 'reels']
  )
  assert.equal(resolveMappedProfileSource(`${profile}/photos_albums`)?.category, 'albums')
  assert.equal(resolveMappedProfileSource(`${profile}/reels`)?.category, 'reels')
  assert.equal(resolveMappedProfileSource('https://www.facebook.com/reel/123'), null)
  assert.equal(resolveMappedProfileSource('https://www.facebook.com/groups/example'), null)
  assert.equal(isMappedProfilePostUrl('facebook', 'https://www.facebook.com/photo/?fbid=123'), true)
  assert.equal(isMappedProfilePostUrl('facebook', 'https://www.facebook.com/reel/123'), true)
  assert.equal(
    isMappedProfilePostUrl('facebook', 'https://www.facebook.com/photo/?fbid=123&setextract'),
    false
  )
})

test('Facebook mapping saves stable post references and deduplicates overlapping photos', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-facebook-map-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-extractor')
  await writeFile(
    bin,
    `#!${process.execPath}
if (process.argv.includes('-J')) {
  process.stdout.write(JSON.stringify({ id: 'fixture', title: 'Reels', entries: [
    { id: '456', title: 'Reel 456', url: 'https://www.facebook.com/reel/456' }
  ] }));
} else {
  const media = [3, 'https://cdn.example/temporary-token.jpg', { id: '123', url: 'https://cdn.example/temporary-token.jpg' }];
  process.stdout.write(JSON.stringify(media) + '\\n' + JSON.stringify(media) + '\\n');
}
`,
    { mode: 0o755 }
  )
  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin }
  })
  const wait = async (category: string) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const mapped = manager.get(profile).categories[category]
      if (mapped?.state !== 'mapping') {
        return mapped
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.fail(`${category} did not finish mapping`)
  }
  manager.map(profile, 'photos')
  const photos = await wait('photos')
  assert.equal(photos?.state, 'complete')
  assert.deepEqual(
    photos?.items.map((item) => [item.id, item.images, item.url]),
    [['123', 1, 'https://www.facebook.com/photo/?fbid=123']]
  )
  manager.map(profile, 'reels')
  const reels = await wait('reels')
  assert.equal(reels?.state, 'complete')
  assert.deepEqual(
    reels?.items.map((item) => [item.id, item.videos, item.url]),
    [['456', 1, 'https://www.facebook.com/reel/456']]
  )
  assert.equal(JSON.stringify(manager.get(profile)).includes('temporary-token'), false)
})

test('a failed Facebook gallery page retains discovered items as partial', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-facebook-partial-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-gallery')
  await writeFile(
    bin,
    `#!${process.execPath}
process.stdout.write(JSON.stringify([3, 'https://cdn.example/temporary.jpg', { id: '789' }]) + '\\n');
process.stderr.write('page failed\\n');
process.exit(1);
`,
    { mode: 0o755 }
  )
  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin }
  })
  manager.map(profile, 'albums')
  let mapped = manager.get(profile).categories.albums
  for (let attempt = 0; attempt < 40 && mapped?.state === 'mapping'; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    mapped = manager.get(profile).categories.albums
  }
  assert.equal(mapped?.state, 'partial')
  assert.equal(mapped?.items[0]?.url, 'https://www.facebook.com/photo/?fbid=789')
  assert.match(mapped?.error ?? '', /page failed/)
})
