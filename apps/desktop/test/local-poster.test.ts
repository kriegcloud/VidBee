import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPosterArgs, isPosterSource } from '../src/main/lib/local-poster-args'

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
