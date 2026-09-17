import { describe, expect, it } from 'vitest'
import { buildDownloadArgs, buildPlaylistInfoArgs, buildVideoInfoArgs } from '../src/yt-dlp-args'

const OF_GALLERY = 'https://onlyfans.com/my/chats/chat/312049181/gallery'
const OF_SOURCE_MP4 = 'https://cdn2.onlyfans.com/files/a/ab/abc/clip_source.mp4'
const OF_PHOTO = 'https://cdn2.onlyfans.com/files/a/ab/abc/1536x2048_photo.jpg'

describe('OnlyFans download identity', () => {
  it('impersonates Chrome and sends an OnlyFans referer for gallery probes', () => {
    const playlistArgs = buildPlaylistInfoArgs(OF_GALLERY, {})
    const videoArgs = buildVideoInfoArgs(OF_GALLERY, {})

    for (const args of [playlistArgs, videoArgs]) {
      expect(args).toContain('--impersonate')
      expect(args[args.indexOf('--impersonate') + 1]).toBe('chrome')
      expect(args).toContain('--add-header')
      expect(args[args.indexOf('--add-header') + 1]).toBe('Referer:https://onlyfans.com/')
    }
  })

  it('downloads CDN photos and source MP4s without a format merge', () => {
    for (const url of [OF_SOURCE_MP4, OF_PHOTO]) {
      const args = buildDownloadArgs({ url, type: 'video' }, '/tmp/vidbee-downloads', {})
      expect(args).toContain('--impersonate')
      expect(args[args.indexOf('--impersonate') + 1]).toBe('chrome')
      expect(args).toContain('Referer:https://onlyfans.com/')
      expect(args).not.toContain('-f')
      expect(args).not.toContain('--merge-output-format')
    }
  })
})
