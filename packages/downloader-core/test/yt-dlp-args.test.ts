import { describe, expect, it } from 'vitest'
import { onlyFansProfile } from '../src/onlyfans-profile'
import { buildDownloadArgs, buildPlaylistInfoArgs, buildVideoInfoArgs } from '../src/yt-dlp-args'

describe('OnlyFans session isolation', () => {
  it.each([
    'https://onlyfans.com/medusa4prsdnt/media',
    'https://onlyfans.com/my/chats/chat/123/gallery',
    'https://cdn2.onlyfans.com/files/a/clip.mp4'
  ])('blocks cookie replay for all legacy yt-dlp paths: %s', (url) => {
    const settings = { browserForCookies: 'chrome', cookiesPath: '/tmp/session.txt' }
    expect(() => buildPlaylistInfoArgs(url, settings)).toThrow('dedicated browser')
    expect(() => buildVideoInfoArgs(url, settings)).toThrow('dedicated browser')
    expect(() => buildDownloadArgs({ url, type: 'video' }, '/tmp/downloads', settings)).toThrow(
      'dedicated browser'
    )
  })

  it('normalizes profile aliases and rejects unrelated URLs', () => {
    expect(onlyFansProfile('https://onlyfans.com/Example/media?x=1')).toEqual({
      username: 'example',
      profileUrl: 'https://onlyfans.com/example'
    })
    for (const url of [
      'https://onlyfans.com.evil.test/example',
      'https://onlyfans.com/my/chats',
      'https://name@onlyfans.com/example',
      'ftp://onlyfans.com/example',
      'https://onlyfans.com/123/example'
    ]) {
      expect(onlyFansProfile(url)).toBeNull()
    }
  })

  it('routes canonical chat and message links into the dedicated map', () => {
    for (const url of [
      'https://onlyfans.com/my/chats/chat/50465073/',
      'https://www.onlyfans.com/my/chats/chat/50465073?firstId=123'
    ]) {
      expect(onlyFansProfile(url)).toEqual({
        username: '50465073',
        chatId: '50465073',
        profileUrl: 'https://onlyfans.com/my/chats/chat/50465073'
      })
    }
    for (const url of [
      'https://onlyfans.com/my/chats/chat/nope',
      'https://onlyfans.com/my/chats/chat/7/extra',
      'https://onlyfans.com/50465073',
      'https://evil.test/my/chats/chat/7'
    ]) {
      expect(onlyFansProfile(url)).toBeNull()
    }
  })

  it('preserves non-OnlyFans extraction', () => {
    expect(buildVideoInfoArgs('https://youtube.com/watch?v=fixture', {})).toContain(
      '--ignore-config'
    )
  })
})
