import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Task } from '@vidbee/task-queue'
import Database from 'better-sqlite3'
import {
  classifyMediaPath,
  groupPostAssets,
  mediaPresentation,
  resolveTaskMediaInventory
} from '../src/main/lib/media-inventory'

const taskFor = (filePath: string, outputDirectory?: string, fileCount?: number): Task =>
  ({
    kind: 'video',
    input: { kind: 'video', url: 'https://example.com/media' },
    output: { filePath, outputDirectory, fileCount }
  }) as Task

test('presentation covers still, animated, AV, mixed and missing inventories', () => {
  assert.equal(mediaPresentation([]), 'missing')
  assert.equal(mediaPresentation([{ kind: 'image' }]), 'image')
  assert.equal(mediaPresentation([{ kind: 'animated' }]), 'image')
  assert.equal(mediaPresentation([{ kind: 'image' }, { kind: 'animated' }]), 'gallery')
  assert.equal(mediaPresentation([{ kind: 'video' }]), 'av')
  assert.equal(mediaPresentation([{ kind: 'audio' }]), 'av')
  assert.equal(mediaPresentation([{ kind: 'animated' }, { kind: 'audio' }]), 'mixed')
  assert.equal(mediaPresentation([{ kind: 'video' }, { kind: 'video' }]), 'gallery')
  assert.equal(classifyMediaPath('PHOTO.JXL'), 'image')
  assert.equal(classifyMediaPath('photo.jpg.part'), undefined)
})

test('directory scan skips metadata, hidden files, symlinks and entries below depth four', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-inventory-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const name of [
    '10.jpg',
    '2.jpg',
    'clip.mp4',
    '.hidden.png',
    'partial.jpg.part',
    'a.ytdl',
    'a.json',
    'a.txt',
    'a.sqlite',
    'a.sqlite-wal',
    'a.srt',
    'a.vtt',
    'a.ass'
  ]) {
    await writeFile(join(root, name), 'abc')
  }
  await mkdir(join(root, '.vidbee'))
  await writeFile(join(root, '.vidbee', 'hidden.jpg'), 'x')
  const deep = join(root, 'a', 'b', 'c', 'd')
  await mkdir(join(deep, 'e'), { recursive: true })
  await writeFile(join(deep, 'depth4.gif'), 'x')
  await writeFile(join(deep, 'e', 'depth5.png'), 'x')
  await symlink(root, join(root, 'loop'))
  await symlink(join(root, '2.jpg'), join(root, 'alias.jpg'))
  const result = await resolveTaskMediaInventory('scan', taskFor(join(root, '2.jpg'), root, 4))
  assert.equal(result.source, 'directory-scan')
  assert.equal(result.presentation, 'mixed')
  assert.deepEqual(
    result.assets.map((asset) => asset.fileName),
    ['2.jpg', '10.jpg', 'depth4.gif', 'clip.mp4']
  )
  assert.deepEqual(result.counts, { image: 2, animated: 1, video: 1, audio: 0 })
  assert.equal(result.totalSize, 10)
  assert.equal(
    result.assets[0].id,
    createHash('sha1').update(join(root, '2.jpg')).digest('hex').slice(0, 16)
  )
  assert.equal(result.truncated, false)
})

test('scan stops at 5000 assets with truncated=true', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-inventory-cap-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (let batch = 0; batch < 51; batch += 1) {
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        writeFile(join(root, `${batch * 100 + index}.jpg`), 'x')
      )
    )
  }
  const result = await resolveTaskMediaInventory('cap', taskFor('', root, 5100))
  assert.equal(result.assets.length, 5000)
  assert.equal(result.truncated, true)
})

test('single video never sweeps unrelated files in its shared Downloads directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-single-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'video.mp4')
  await writeFile(file, 'video')
  await writeFile(join(root, 'unrelated.jpg'), 'image')
  const result = await resolveTaskMediaInventory('single', taskFor(file))
  assert.equal(result.source, 'single-file')
  assert.deepEqual(
    result.assets.map((asset) => asset.path),
    [file]
  )
  await rm(file)
  const missing = await resolveTaskMediaInventory('single', taskFor(file))
  assert.equal(missing.presentation, 'missing')
  assert.equal(missing.source, 'none')
  assert.equal(missing.assets.length, 0)
})

test('sidecar resolves absolute and relative files, drops missing files and deduplicates', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-sidecar-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, 'photo10.jpg')
  await writeFile(file, 'image')
  await writeFile(join(root, 'photo2.png'), 'png')
  await writeFile(
    `${file}.manifest.json`,
    JSON.stringify({ files: [file, 'photo2.png', 'missing.jpg', file, 'ignored.json', 3] })
  )
  const result = await resolveTaskMediaInventory('sidecar', taskFor(file, root, 1))
  assert.equal(result.source, 'sidecar-manifest')
  assert.equal(result.presentation, 'gallery')
  assert.deepEqual(
    result.assets.map((asset) => asset.fileName),
    ['photo2.png', 'photo10.jpg']
  )
})

test('social SQLite manifest preserves dimensions and filters missing files', async (t) => {
  let db: Database.Database
  try {
    db = new Database(':memory:')
    db.close()
  } catch (error) {
    t.skip(`better-sqlite3 native binding unavailable under Node (Electron ABI): ${String(error)}`)
    return
  }
  const root = await mkdtemp(join(tmpdir(), 'vidbee-social-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, '.vidbee'))
  const manifest = join(root, '.vidbee', 'social-media.sqlite')
  await writeFile(join(root, '2.jpg'), 'jpg')
  await writeFile(join(root, '10.png'), 'png')
  await writeFile(join(root, 'unlisted.jpg'), 'unlisted')
  db = new Database(manifest)
  try {
    db.exec('CREATE TABLE assets (path TEXT, size INTEGER, width INTEGER, height INTEGER)')
    const insert = db.prepare('INSERT INTO assets VALUES (?, ?, ?, ?)')
    insert.run('2.jpg', 3, 640, 480)
    insert.run(join(root, '10.png'), 3, 1280, 720)
    insert.run('missing.jpg', 3, 1, 1)
  } finally {
    db.close()
  }
  for (const task of [taskFor(manifest), taskFor(join(root, '2.jpg'), root, 2)]) {
    const result = await resolveTaskMediaInventory('social', task)
    assert.equal(result.source, 'social-manifest')
    assert.equal(result.rootDirectory, root)
    assert.deepEqual(
      result.assets.map((asset) => [asset.fileName, asset.width, asset.height]),
      [
        ['2.jpg', 640, 480],
        ['10.png', 1280, 720]
      ]
    )
  }
})

test('a missing one-file task in a shared folder is missing, not the whole folder', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-shared-photos-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'other-post-1.jpg'), 'x')
  await writeFile(join(root, 'other-post-2.jpg'), 'x')
  const inventory = await resolveTaskMediaInventory(
    'gone',
    taskFor(join(root, 'deleted-photo.jpg'), root, 1)
  )
  assert.equal(inventory.presentation, 'missing')
  assert.equal(inventory.assets.length, 0)
})

test('a manifest shared at the download root keeps only files from this run', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-shared-manifest-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, '.vidbee'))
  const manifest = join(root, '.vidbee', 'social-media.sqlite')
  const db = new Database(manifest)
  db.exec(
    'CREATE TABLE assets (id TEXT PRIMARY KEY, path TEXT, size INTEGER, sha256 TEXT, width INTEGER, height INTEGER, quality TEXT)'
  )
  const insert = db.prepare('INSERT INTO assets (id, path, size) VALUES (?, ?, 1)')
  insert.run('old', join(root, 'old.jpg'))
  insert.run('new', join(root, 'new.jpg'))
  db.close()
  await writeFile(join(root, 'old.jpg'), 'x')
  await writeFile(join(root, 'new.jpg'), 'x')
  const { utimes } = await import('node:fs/promises')
  const oldTime = new Date(Date.now() - 3_600_000)
  await utimes(join(root, 'old.jpg'), oldTime, oldTime)
  const now = Date.now()
  const task = {
    input: {
      kind: 'social-media',
      options: { settings: { downloadPath: root } },
      url: 'https://example.com/p/1'
    },
    kind: 'social-media',
    output: {
      collectionSummary: { finishedAt: now + 1000, startedAt: now - 60_000 },
      filePath: manifest,
      outputDirectory: root
    }
  } as unknown as Task
  const inventory = await resolveTaskMediaInventory('shared', task)
  assert.deepEqual(
    inventory.assets.map((asset) => asset.fileName),
    ['new.jpg']
  )
})

test('groupPostAssets recovers one carousel from a shared, dated batch folder', () => {
  const asset = (fileName: string, mtimeMs: number) =>
    ({ fileName, kind: 'image', mtimeMs, path: `/p/Posts/${fileName}` }) as Parameters<
      typeof groupPostAssets
    >[0][number]
  const assets = [
    asset('2026-09-01_100.jpg', 1000),
    asset('2026-09-01_101.jpg', 2000),
    asset('2026-09-01_102.jpg', 3000),
    asset('2026-09-01_900.jpg', 90_000),
    asset('2026-08-31_050.jpg', 1000)
  ]
  const all = groupPostAssets(assets, '/p/Posts/2026-09-01_100.jpg', undefined)
  assert.deepEqual(
    all?.map((item) => item.fileName),
    ['2026-09-01_100.jpg', '2026-09-01_101.jpg', '2026-09-01_102.jpg', '2026-09-01_900.jpg']
  )
  const trimmed = groupPostAssets(assets, '/p/Posts/2026-09-01_100.jpg', 3)
  assert.deepEqual(trimmed?.map((item) => item.fileName).sort(), [
    '2026-09-01_100.jpg',
    '2026-09-01_101.jpg',
    '2026-09-01_102.jpg'
  ])
  assert.equal(groupPostAssets(assets, '/p/Posts/undated.jpg', 3), null)
})
