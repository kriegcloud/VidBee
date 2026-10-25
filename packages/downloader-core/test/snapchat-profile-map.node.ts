import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  resolveDefaultGalleryDlFilenameTemplate,
  resolveDownloadTaskKind,
  shouldUseGalleryDl
} from '../src/gallery-dl-executor'
import { isMappedProfilePostUrl, resolveMappedProfileSource } from '../src/mapped-profile-source'
import { normalizeSnapchatUrl } from '../src/snapchat'
import { parseGalleryDlDate } from '../src/snapchat-profile-map'
import { SocialProfileManager } from '../src/social-profile-manager'

const SPOTLIGHT_ID = 'W7_EDlXWTBiXAEEniNoMPwAAYZG53Ym9vYnF2AZ4dIjYBAZ4dIg_xAAAAAw'

test('Snapchat profile aliases resolve to one account with two categories', () => {
  for (const alias of [
    'https://www.snapchat.com/@SydLuv31',
    'https://snapchat.com/add/sydluv31',
    'https://story.snapchat.com/@sydluv31',
    'https://www.snapchat.com/@sydluv31/spotlights'
  ]) {
    const source = resolveMappedProfileSource(alias)
    assert.equal(source?.platform, 'snapchat', alias)
    assert.equal(source?.owner, 'sydluv31', alias)
    assert.deepEqual(
      source?.categories.map((entry) => [entry.key, entry.url]),
      [
        ['stories', 'https://www.snapchat.com/@sydluv31/stories'],
        ['spotlight', 'https://www.snapchat.com/@sydluv31/spotlights']
      ]
    )
  }
  assert.equal(resolveMappedProfileSource('https://www.snapchat.com/spotlight/abc'), null)
  assert.equal(normalizeSnapchatUrl('https://evil.example/@sydluv31'), null)
})

test('mapped Snapchat items download through gallery-dl into per-category folders', () => {
  const snap = 'https://www.snapchat.com/@sydluv31/stories?vidbee_snap=BnfoeCKU0xMFXr6wLNRDv.400'
  const spotlight = `https://www.snapchat.com/@sydluv31/spotlight/${SPOTLIGHT_ID}`
  assert.equal(isMappedProfilePostUrl('snapchat', snap), true)
  assert.equal(isMappedProfilePostUrl('snapchat', spotlight), true)
  assert.equal(isMappedProfilePostUrl('snapchat', 'https://www.snapchat.com/@sydluv31'), false)
  for (const url of [snap, spotlight]) {
    assert.equal(resolveDownloadTaskKind(url, 'video'), 'snapchat-media')
    assert.equal(shouldUseGalleryDl(url), true)
    assert.equal(resolveDefaultGalleryDlFilenameTemplate(url), '{date:%Y-%m-%d}_{file_id}.{extension}')
  }
  assert.deepEqual(normalizeSnapchatUrl(snap)?.directorySegments, ['Snapchat', 'sydluv31', 'Stories'])
  assert.deepEqual(normalizeSnapchatUrl(spotlight)?.directorySegments, [
    'Snapchat',
    'sydluv31',
    'Spotlight'
  ])
  // A tampered snap id is rejected rather than passed to gallery-dl.
  assert.equal(
    normalizeSnapchatUrl('https://www.snapchat.com/@sydluv31/stories?vidbee_snap=../../x'),
    null
  )
})

test('gallery-dl dates parse as UTC', () => {
  assert.equal(parseGalleryDlDate('2024-11-01 23:06:25'), Date.UTC(2024, 10, 1, 23, 6, 25))
  assert.equal(parseGalleryDlDate('yesterday'), undefined)
})

test('a Snapchat profile maps stories per snap and spotlights per post', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-snapchat-map-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'fake-gallery-dl')
  await writeFile(
    bin,
    `#!${process.execPath}
const target = process.argv.at(-1);
const url = (meta) => console.log(JSON.stringify([3, 'https://cf-st.sc-cdn.net/d/signed', meta]));
if (target.endsWith('/stories')) {
  url({ vidbee_category: 'stories', file_id: 'CurrentAAAA1.400', extension: 'jpg', date: '2026-10-24 07:04:43', title: 'Snapchat Story' });
  url({ vidbee_category: 'stories', file_id: 'HighAAAAAA2.27', extension: 'mp4', date: '2024-11-01 23:06:25', title: 'trip' });
  url({ vidbee_category: 'stories', extension: 'jpg' });
} else {
  url({ vidbee_category: 'spotlight', file_id: 'SpotAAAAAA1.27', spotlight_id: '${SPOTLIGHT_ID}', extension: 'mp4', upload_ms: 1778605232113, date: '2026-05-12 17:00:32' });
}
`,
    { mode: 0o755 }
  )
  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin }
  })
  const url = 'https://www.snapchat.com/@sydluv31'
  const settle = async (category: string) => {
    let profile = manager.get(url)
    for (let attempt = 0; attempt < 80 && profile.categories[category]?.state === 'mapping'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      profile = manager.get(url)
    }
    return profile
  }
  manager.map(url, 'stories')
  let profile = await settle('stories')
  assert.equal(profile.categories.stories?.state, 'complete')
  assert.deepEqual(profile.categories.stories?.items, [
    {
      id: 'CurrentAAAA1.400',
      url: 'https://www.snapchat.com/@sydluv31/stories?vidbee_snap=CurrentAAAA1.400',
      author: 'sydluv31',
      title: 'Snapchat Story',
      images: 1,
      videos: 0,
      publishedAt: Date.UTC(2026, 9, 24, 7, 4, 43)
    },
    {
      id: 'HighAAAAAA2.27',
      url: 'https://www.snapchat.com/@sydluv31/stories?vidbee_snap=HighAAAAAA2.27',
      author: 'sydluv31',
      title: 'trip',
      images: 0,
      videos: 1,
      publishedAt: Date.UTC(2024, 10, 1, 23, 6, 25)
    }
  ])
  manager.map(url, 'spotlight')
  profile = await settle('spotlight')
  assert.equal(profile.categories.spotlight?.state, 'complete')
  assert.deepEqual(profile.categories.spotlight?.items, [
    {
      id: SPOTLIGHT_ID,
      url: `https://www.snapchat.com/@sydluv31/spotlight/${SPOTLIGHT_ID}`,
      author: 'sydluv31',
      images: 0,
      videos: 1,
      publishedAt: 1778605232113
    }
  ])
})
