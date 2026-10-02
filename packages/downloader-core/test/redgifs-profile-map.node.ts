import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { isMappedProfilePostUrl, resolveMappedProfileSource } from '../src/mapped-profile-source'
import { SocialProfileManager } from '../src/social-profile-manager'

test('Redgifs user mapping saves watch pages without media URLs', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-redgifs-map-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-ytdlp')
  await writeFile(
    bin,
    `#!${process.execPath}
console.log(JSON.stringify({ extractor_key: 'RedGifs', id: 'JovialPristinePterosaurs', title: 'First post', url: 'https://media.redgifs.com/private.mp4' }));
console.log(JSON.stringify({ extractor_key: 'RedGifs', id: '../invalid', url: 'https://media.redgifs.com/other.mp4' }));
`,
    { mode: 0o755 }
  )
  const url = 'https://www.redgifs.com/users/medusa4prsdnt'
  assert.equal(resolveMappedProfileSource(url)?.platform, 'redgifs')
  assert.equal(resolveMappedProfileSource('https://www.redgifs.com/watch/example'), null)
  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin }
  })
  manager.map(url, 'posts')
  let profile = manager.get(url)
  for (let attempt = 0; attempt < 40 && profile.categories.posts?.state === 'mapping'; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    profile = manager.get(url)
  }
  assert.equal(profile.categories.posts?.state, 'complete')
  assert.deepEqual(profile.categories.posts?.items, [
    {
      id: 'JovialPristinePterosaurs',
      url: 'https://www.redgifs.com/watch/jovialpristinepterosaurs',
      author: 'medusa4prsdnt',
      images: 0,
      videos: 1,
      title: 'First post'
    }
  ])
  assert.equal(
    isMappedProfilePostUrl('redgifs', profile.categories.posts.items[0]?.url ?? ''),
    true
  )
  assert.equal(isMappedProfilePostUrl('redgifs', 'https://media.redgifs.com/private.mp4'), false)
  assert.equal(manager.list()[0]?.owner, 'medusa4prsdnt')
})
