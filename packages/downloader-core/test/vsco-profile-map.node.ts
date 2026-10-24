import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { resolveDownloadTaskKind } from '../src/gallery-dl-executor'
import { isMappedProfilePostUrl, resolveMappedProfileSource } from '../src/mapped-profile-source'
import { SocialProfileManager } from '../src/social-profile-manager'

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
    `#!${process.execPath}
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
