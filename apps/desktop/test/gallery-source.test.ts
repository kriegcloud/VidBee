import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { Task } from '@vidbee/task-queue'
import Database from 'better-sqlite3'
import { resolveLegacySocialMediaFile } from '../src/main/lib/social-media-file'
import { resolveTaskSourceFile } from '../src/main/lib/source-file'

test('a legacy video task retried as a photo gallery is not a transcription source', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-gallery-source-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const filePath = path.join(root, 'photo.jpg')
  await writeFile(filePath, 'photo')
  const task = {
    kind: 'video',
    input: { kind: 'video', url: 'https://www.facebook.com/123/photos' },
    output: { filePath, size: 5, outputDirectory: root, fileCount: 1 }
  } as Task
  assert.equal(resolveTaskSourceFile(task), null)
  // The same file-resolution path remains available to ordinary single-media tasks.
  assert.ok(task.output)
  task.output.outputDirectory = undefined
  assert.equal(resolveTaskSourceFile(task), filePath)
})

const socialSummary = (manifestPath: string, posts: number, videos: number) => ({
  posts,
  images: 0,
  videos,
  downloaded: videos,
  existing: 0,
  failed: 0,
  totalSize: 5,
  reason: 'exhausted' as const,
  manifestPath,
  startedAt: 1,
  finishedAt: 2
})

test('a single social post video is a transcription source', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-social-source-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const filePath = path.join(root, '1_1.mp4')
  await writeFile(filePath, 'video')
  const manifestPath = path.join(root, 'social-media.sqlite')
  const task = {
    id: 'single-post',
    kind: 'social-media',
    status: 'completed',
    input: { kind: 'social-media', url: 'https://x.com/i/web/status/1' },
    output: {
      filePath,
      size: 5,
      outputDirectory: root,
      fileCount: 1,
      collectionSummary: socialSummary(manifestPath, 1, 1)
    }
  } as unknown as Task
  assert.equal(resolveTaskSourceFile(task), filePath)
  // A profile collection has no single source even when its first file is a video.
  assert.ok(task.output?.collectionSummary)
  task.output.collectionSummary = socialSummary(manifestPath, 12, 7)
  assert.equal(resolveTaskSourceFile(task), null)
})

test('a social post recorded before per-asset reporting is found in its manifest', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-social-legacy-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const video = path.join(root, 'X', 'owner', '2118661127462850821_1.mp4')
  await mkdir(path.dirname(video), { recursive: true })
  await writeFile(video, 'video')
  const manifestPath = path.join(root, '.vidbee', 'social-media.sqlite')
  await mkdir(path.dirname(manifestPath))
  const db = new Database(manifestPath)
  db.exec(
    'CREATE TABLE assets (id TEXT PRIMARY KEY, path TEXT, size INTEGER, sha256 TEXT, width INTEGER, height INTEGER, quality TEXT)'
  )
  const insert = db.prepare('INSERT INTO assets VALUES (?,?,?,?,?,?,?)')
  insert.run('twitter:2118661127462850821:1:video', video, 5, 'x', 0, 0, 'highest-v1')
  insert.run('twitter:99:1:video', path.join(root, 'other.mp4'), 5, 'y', 0, 0, 'highest-v1')
  db.close()
  const task = {
    id: 'legacy-post',
    kind: 'social-media',
    status: 'completed',
    input: { kind: 'social-media', url: 'https://x.com/i/web/status/2118661127462850821' },
    output: {
      filePath: manifestPath,
      size: 5,
      outputDirectory: root,
      fileCount: 1,
      collectionSummary: socialSummary(manifestPath, 1, 1)
    }
  } as unknown as Task
  assert.equal(resolveLegacySocialMediaFile(task), video)
  assert.equal(resolveTaskSourceFile(task), video)
})
