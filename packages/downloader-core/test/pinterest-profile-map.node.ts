import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { TaskKindSchema } from '@vidbee/task-queue/schemas'
import { TRANSCRIBABLE_TASK_KINDS } from '@vidbee/task-queue/types'
import { isOutputComplete } from '../../task-queue/src/complete'
import {
  HostRoutingExecutor,
  resolveDefaultGalleryDlFilenameTemplate,
  resolveDownloadTaskKind,
  shouldUseGalleryDl
} from '../src/gallery-dl-executor'
import { isMappedProfilePostUrl, resolveMappedProfileSource } from '../src/mapped-profile-source'
import { normalizePinterestUrl } from '../src/pinterest'
import { mapPinterestProfile } from '../src/pinterest-profile-map'
import type { SocialMappedItem } from '../src/social-media-service'
import { SocialProfileManager } from '../src/social-profile-manager'

const PROFILE = 'https://www.pinterest.com/TheLumiShop/_created/'
const PIN = 'https://www.pinterest.com/pin/338051515795810385/'

const fixture = async (t: { after: (fn: () => Promise<void>) => void }, script: string) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-pinterest-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = path.join(root, 'gallery-dl')
  await writeFile(bin, `#!${process.execPath}\n${script}\n`, { mode: 0o755 })
  return { root, bin }
}

test('Pinterest created profiles and pin aliases route through gallery-dl', () => {
  assert.equal(resolveMappedProfileSource(PROFILE)?.platform, 'pinterest')
  assert.equal(
    resolveMappedProfileSource('http://pinterest.com/TheLumiShop/?foo=bar')?.profileUrl,
    PROFILE
  )
  assert.equal(
    normalizePinterestUrl('https://www.pinterest.com/pin/outfit--338051515795810385/')?.url,
    PIN
  )
  assert.equal(resolveMappedProfileSource(PIN), null)
  for (const url of [PROFILE, PIN]) {
    assert.equal(shouldUseGalleryDl(url), true)
    assert.equal(resolveDownloadTaskKind(url, 'video'), 'pinterest-gallery')
    assert.equal(resolveDownloadTaskKind(url, 'audio'), 'pinterest-gallery')
    assert.equal(resolveDefaultGalleryDlFilenameTemplate(url), '{id}_{num:>02}.{extension}')
  }
  assert.equal(TaskKindSchema.parse('pinterest-gallery'), 'pinterest-gallery')
  assert.equal(TRANSCRIBABLE_TASK_KINDS.has('pinterest-gallery'), false)
  assert.equal(isMappedProfilePostUrl('pinterest', PIN), true)
  for (const url of [PROFILE, `${PIN}?tracking=1`, 'https://i.pinimg.com/file.jpg']) {
    assert.equal(isMappedProfilePostUrl('pinterest', url), false)
  }
  for (const url of [
    'https://pinterest.com.evil.test/TheLumiShop/_created/',
    'https://evil@pinterest.com/TheLumiShop/_created/',
    'https://pinterest.com:444/TheLumiShop/_created/',
    'ftp://pinterest.com/TheLumiShop/',
    'https://pinterest.com/search/',
    'https://pinterest.com/pin/nope/',
    'https://pinterest.com/TheLumiShop/_saved/'
  ]) {
    assert.equal(normalizePinterestUrl(url), null)
  }
})

test('Pinterest pins including legacy video tasks select the gallery executor', () => {
  let selected = ''
  const executor = (name: string) => ({
    run: () => {
      selected = name
      return { cancel: async () => {}, pause: async () => {} }
    }
  })
  const router = new HostRoutingExecutor(executor('yt-dlp'), executor('gallery-dl'))
  router.run(
    { taskId: 'pin', attemptId: 'one', attemptNumber: 1, input: { kind: 'video', url: PIN } },
    { onSpawn() {}, onProgress() {}, onStd() {}, onFinish() {} }
  )
  assert.equal(selected, 'gallery-dl')
})

test('Pinterest mapping persists exact pin IDs and deduplicates carousel assets and refreshes', async (t) => {
  const { root, bin } = await fixture(
    t,
    `
const args = process.argv.slice(2);
if (!args.includes('-j') || args.at(-1) !== ${JSON.stringify(PROFILE)}) process.exit(9);
const emit = (metadata) => console.log(JSON.stringify([3, 'https://i.pinimg.com/signed.jpg', metadata]));
emit({ id: '338051515795810385', num: 1, extension: 'jpg', title: 'Outfit' });
emit({ id: '338051515795810385', num: 1, extension: 'jpg', title: 'Outfit' });
emit({ id: '338051515795810385', num: 2, extension: 'mp4', title: 'Outfit' });
emit({ id: '338051515795810384', num: 1, extension: 'webp' });
emit({ id: '338051515795810383', num: 1, extension: 'txt' });
emit({ id: 338051515795810382, num: 1, extension: 'jpg' });
emit({ id: '../bad', num: 1, extension: 'jpg' });
`
  )
  const manager = new SocialProfileManager({
    storageDir: path.join(root, 'profiles'),
    resolveYtDlpPath: () => bin,
    runtime: { resolveBinaryPath: () => bin }
  })
  for (let run = 0; run < 2; run++) {
    manager.map(PROFILE, 'posts')
    let profile = manager.get(PROFILE)
    for (let attempt = 0; attempt < 80 && profile.categories.posts.state === 'mapping'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      profile = manager.get(PROFILE)
    }
    assert.equal(profile.categories.posts.state, 'complete')
    assert.deepEqual(profile.categories.posts.items, [
      {
        id: '338051515795810385',
        url: PIN,
        author: 'TheLumiShop',
        title: 'Outfit',
        images: 1,
        videos: 1
      },
      {
        id: '338051515795810384',
        url: 'https://www.pinterest.com/pin/338051515795810384/',
        author: 'TheLumiShop',
        images: 1,
        videos: 0
      }
    ])
    assert.equal(manager.list()[0].platform, 'pinterest')
  }
})

for (const scenario of ['empty', 'failed', 'cancelled'] as const) {
  test(`Pinterest mapping reports ${scenario} traversal without claiming completeness`, async (t) => {
    const script =
      scenario === 'empty'
        ? ''
        : `
console.log(JSON.stringify([3, 'https://i.pinimg.com/asset.jpg', { id: '123', num: 1, extension: 'jpg' }]));
${scenario === 'failed' ? "console.error('HTTP 429'); process.exitCode = 1;" : 'setInterval(() => {}, 1000);'}
`
    const { bin } = await fixture(t, script)
    const controller = new AbortController()
    const items: SocialMappedItem[] = []
    const result = await mapPinterestProfile(
      PROFILE,
      'TheLumiShop',
      {
        resolveGalleryDlPath: () => bin,
        resolveYtDlpPath: () => bin
      },
      undefined,
      controller.signal,
      (item) => {
        items.push(item)
        if (scenario === 'cancelled') {
          controller.abort()
        }
      }
    )
    assert.equal(result.complete, false)
    assert.equal(items.length, scenario === 'empty' ? 0 : 1)
    if (scenario === 'failed') {
      assert.match(result.error ?? '', /HTTP 429/)
    }
    if (scenario === 'empty') {
      assert.match(result.error ?? '', /No media pins/)
    }
  })
}

test('Pinterest completion requires a nonempty gallery with no failed assets', () => {
  const output = {
    filePath: null,
    size: 10,
    durationMs: null,
    sha256: null,
    formatId: null,
    outputDirectory: '/downloads/Pinterest/Pins',
    fileCount: 2,
    failedCount: 0
  }
  const check = { filePresent: () => true }
  assert.equal(isOutputComplete('pinterest-gallery', output, check), true)
  assert.equal(isOutputComplete('pinterest-gallery', { ...output, fileCount: 0 }, check), false)
  assert.equal(isOutputComplete('pinterest-gallery', { ...output, failedCount: 1 }, check), false)
  assert.equal(isOutputComplete('pinterest-gallery', output, { filePresent: () => false }), false)
})
