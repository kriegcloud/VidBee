import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { resolveDownloadTaskKind } from '../src/gallery-dl-executor'
import { isMappedProfilePostUrl, resolveMappedProfileSource } from '../src/mapped-profile-source'
import { SocialProfileManager } from '../src/social-profile-manager'

test('a Threads media tab maps carousels to one item per post', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-threads-map-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-gallery-dl')
  // One post with two images and one with a video; the carousel arrives as
  // separate URL events sharing an id.
  await writeFile(
    bin,
    `#!${process.execPath}
const url = (meta) => console.log(JSON.stringify([3, 'https://scontent.cdninstagram.com/signed.jpg', meta]));
url({ id: '3271', shortcode: 'DAbCdEf', username: 'benoppold', num: 1, extension: 'jpg' });
url({ id: '3271', shortcode: 'DAbCdEf', username: 'benoppold', num: 2, extension: 'webp' });
url({ id: '3272', shortcode: 'DGhIjKl', username: 'benoppold', num: 1, extension: 'mp4' });
url({ id: '3273', shortcode: 'no', username: 'benoppold', num: 1, extension: 'jpg' });
`,
    { mode: 0o755 }
  )
  const url = 'https://www.threads.com/@benoppold/media'
  const source = resolveMappedProfileSource(url)
  assert.equal(source?.platform, 'threads')
  assert.equal(source?.owner, 'benoppold')
  assert.equal(source?.categories[0]?.key, 'media')
  // A profile without the media suffix resolves to the same tab; a post does not.
  assert.equal(resolveMappedProfileSource('https://www.threads.com/@benoppold')?.profileUrl, url)
  assert.equal(resolveMappedProfileSource('https://www.threads.com/@benoppold/post/DAbCdEf'), null)

  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin }
  })
  manager.map(url, 'media')
  let profile = manager.get(url)
  for (let attempt = 0; attempt < 40 && profile.categories.media?.state === 'mapping'; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    profile = manager.get(url)
  }
  assert.equal(profile.categories.media?.state, 'complete')
  assert.deepEqual(profile.categories.media?.items, [
    {
      id: '3271',
      url: 'https://www.threads.com/@benoppold/post/DAbCdEf',
      author: 'benoppold',
      images: 2,
      videos: 0
    },
    {
      id: '3272',
      url: 'https://www.threads.com/@benoppold/post/DGhIjKl',
      author: 'benoppold',
      images: 0,
      videos: 1
    }
  ])
})

test('mapped Threads posts stay on their own extractor', () => {
  const post = 'https://www.threads.com/@benoppold/post/DAbCdEf'
  assert.equal(isMappedProfilePostUrl('threads', post), true)
  assert.equal(resolveDownloadTaskKind(post, 'video'), 'threads-post')
  assert.equal(isMappedProfilePostUrl('threads', 'https://www.threads.com/@benoppold/media'), false)
  assert.equal(
    isMappedProfilePostUrl('threads', 'https://scontent.cdninstagram.com/signed.jpg'),
    false
  )
})
