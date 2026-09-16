import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDownloadArgs } from '../src/yt-dlp-args'

test('video downloads disable unplayable mode while preserving embedding', () => {
  const args = buildDownloadArgs(
    { url: 'https://example.com/video.mp4', type: 'video' },
    '/tmp/vidbee-downloads',
    {}
  )

  assert.ok(args.includes('--no-allow-unplayable-formats'))
  assert.ok(!args.includes('--allow-unplayable-formats'))
  for (const flag of ['--embed-metadata', '--embed-chapters', '--embed-subs']) {
    assert.ok(args.includes(flag))
  }
})

test('audio downloads disable unplayable mode even with a custom config', () => {
  const args = buildDownloadArgs(
    { url: 'https://example.com/audio.m4a', type: 'audio' },
    '/tmp/vidbee-downloads',
    { configPath: '/tmp/vidbee-custom.conf', embedMetadata: false, embedChapters: false }
  )

  assert.ok(args.includes('--no-allow-unplayable-formats'))
  assert.ok(args.includes('--config-location'))
  assert.ok(args.includes('--no-embed-metadata'))
  assert.ok(args.includes('--no-embed-chapters'))
  assert.ok(args.includes('--no-embed-subs'))
})
