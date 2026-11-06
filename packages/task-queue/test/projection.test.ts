import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectTaskToLegacy } from '../src/projection'
import { task } from './fixtures'

const summary = {
  posts: 1,
  images: 0,
  videos: 1,
  downloaded: 1,
  existing: 0,
  failed: 0,
  totalSize: 5,
  reason: 'exhausted' as const,
  manifestPath: '/dl/.vidbee/social-media.sqlite',
  startedAt: 1,
  finishedAt: 2
}

test('a social post projects its own media path, never the shared manifest', () => {
  const media = task('post', {
    kind: 'social-media',
    input: { kind: 'social-media', url: 'https://x.com/i/web/status/1' },
    output: {
      filePath: '/dl/X/owner/1_1.mp4',
      size: 5,
      durationMs: null,
      sha256: null,
      outputDirectory: '/dl',
      fileCount: 1,
      collectionSummary: summary
    }
  })
  const projected = projectTaskToLegacy(media)
  assert.equal(projected.filePath, '/dl/X/owner/1_1.mp4')
  assert.equal(projected.savedFileName, '1_1.mp4')

  const legacy = projectTaskToLegacy(
    task('legacy', {
      ...media,
      output: { ...media.output, filePath: summary.manifestPath } as typeof media.output
    })
  )
  assert.equal(legacy.filePath, undefined)
  assert.equal(legacy.savedFileName, undefined)
})

test('gallery media saved below the output directory keeps its absolute path', () => {
  const projected = projectTaskToLegacy(
    task('threads', {
      kind: 'threads-post',
      input: { kind: 'threads-post', url: 'https://www.threads.com/@owner/post/abc' },
      output: {
        filePath: '/dl/Threads/owner/abc/1.mp4',
        size: 5,
        durationMs: null,
        sha256: null,
        outputDirectory: '/dl/Threads/owner',
        fileCount: 1
      }
    })
  )
  assert.equal(projected.downloadPath, '/dl/Threads/owner')
  assert.equal(projected.filePath, '/dl/Threads/owner/abc/1.mp4')
})
