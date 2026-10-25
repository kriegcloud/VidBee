import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  buildPosterArgs,
  firstMediaInDirectory,
  isPosterSource,
  posterSeekPlan,
  posterSourceKey,
  resolvePosterSource,
  VIDEO_SEEK_SECONDS
} from '../src/main/lib/local-poster-args'

test('a poster source is any still or clip we can decode a frame from', () => {
  for (const name of ['a.jpg', 'A.JPEG', 'b.png', 'c.webp', 'd.mp4', 'e.MKV', 'f.mov']) {
    assert.equal(isPosterSource(name), true, name)
  }
  for (const name of ['notes.txt', 'meta.json', 'audio.m4a', 'subs.vtt', 'noext']) {
    assert.equal(isPosterSource(name), false, name)
  }
})

test('an image poster decodes the only frame there is', () => {
  const args = buildPosterArgs('/media/photo.jpg', '/cache/poster.jpg')
  assert.equal(args.includes('-ss'), false)
  assert.deepEqual(args.slice(-7), [
    '-frames:v',
    '1',
    '-vf',
    "scale='min(320,iw)':-2",
    '-f',
    'image2',
    '/cache/poster.jpg'
  ])
  assert.equal(args.at(-8), '/media/photo.jpg')
  assert.equal(args.at(0), '-hide_banner')
})

test('a video poster seeks first so it is not the black opening frame', () => {
  const args = buildPosterArgs('/media/clip.mp4', '/cache/poster.jpg', 1)
  const seek = args.indexOf('-ss')
  assert.ok(seek >= 0)
  assert.equal(args[seek + 1], '1')
  // The seek must precede -i to stay a fast keyframe seek.
  assert.ok(seek < args.indexOf('-i'))
})

test('the target is always the last argument so ffmpeg writes where we expect', () => {
  assert.equal(buildPosterArgs('/media/clip.mp4', '/cache/p.jpg', 1).at(-1), '/cache/p.jpg')
  assert.equal(buildPosterArgs('/media/photo.png', '/cache/q.jpg').at(-1), '/cache/q.jpg')
})

const withTempDir = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vidbee-poster-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
}

test('a collection directory yields its first non-empty media file in name order', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'b.mp4'), 'video')
    await writeFile(path.join(dir, 'a.jpg'), 'image')
    await writeFile(path.join(dir, 'meta.json'), '{}')
    await mkdir(path.join(dir, 'sub'))
    await writeFile(path.join(dir, 'sub', '0.jpg'), 'nested')
    assert.equal(await firstMediaInDirectory(dir), path.join(dir, 'a.jpg'))
  })
})

test('a directory with no media, or one that does not exist, yields nothing', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, 'meta.json'), '{}')
    await writeFile(path.join(dir, 'empty.jpg'), '')
    assert.equal(await firstMediaInDirectory(dir), null)
    assert.equal(await firstMediaInDirectory(path.join(dir, 'missing')), null)
  })
})

test('a zero-byte or missing file is not a poster source', async () => {
  await withTempDir(async (dir) => {
    const empty = path.join(dir, 'empty.mp4')
    await writeFile(empty, '')
    assert.equal(await resolvePosterSource({ filePath: empty }), null)
    assert.equal(await resolvePosterSource({ filePath: path.join(dir, 'gone.mp4') }), null)
  })
})

test('the own file wins over the directory, and a non-media file falls through to it', async () => {
  await withTempDir(async (dir) => {
    const own = path.join(dir, 'z.mp4')
    await writeFile(own, 'video')
    await writeFile(path.join(dir, 'a.jpg'), 'image')
    await writeFile(path.join(dir, 'notes.txt'), 'text')
    assert.equal((await resolvePosterSource({ directory: dir, filePath: own }))?.path, own)
    const fallback = await resolvePosterSource({
      directory: dir,
      filePath: path.join(dir, 'notes.txt')
    })
    assert.equal(fallback?.path, path.join(dir, 'a.jpg'))
  })
})

test('the poster key changes when the file is re-downloaded', () => {
  const base = posterSourceKey('/media/a.mp4', { mtimeMs: 1000, size: 50 })
  assert.equal(base, posterSourceKey('/media/a.mp4', { mtimeMs: 1000, size: 50 }))
  assert.notEqual(base, posterSourceKey('/media/a.mp4', { mtimeMs: 2000, size: 50 }))
  assert.notEqual(base, posterSourceKey('/media/a.mp4', { mtimeMs: 1000, size: 51 }))
  assert.notEqual(base, posterSourceKey('/media/b.mp4', { mtimeMs: 1000, size: 50 }))
})

test('videos seek then fall back to frame one; stills take frame one', () => {
  assert.deepEqual(posterSeekPlan('/media/clip.mp4'), [VIDEO_SEEK_SECONDS, 0])
  assert.deepEqual(posterSeekPlan('/media/CLIP.MKV'), [VIDEO_SEEK_SECONDS, 0])
  assert.deepEqual(posterSeekPlan('/media/photo.jpg'), [0])
})
