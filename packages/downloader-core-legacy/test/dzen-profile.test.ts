import { describe, expect, it } from 'vitest'
import { normalizeDzenProfileUrl } from '../src/dzen-profile'
import { buildPlaylistInfoArgs } from '../src/yt-dlp-args'

const PROFILE = 'https://dzen.ru/id/5f272f80ba199a2a3379d0d2'

describe('Dzen profiles', () => {
  it.each([
    PROFILE,
    `${PROFILE}/?from=channel`,
    PROFILE.replace('dzen.ru', 'www.dzen.ru'),
    PROFILE.replace('dzen.ru', 'zen.yandex.ru')
  ])('normalizes a channel ID: %s', (url) => {
    expect(normalizeDzenProfileUrl(url)).toBe(PROFILE)
  })

  it('normalizes a named channel', () => {
    expect(normalizeDzenProfileUrl('http://www.dzen.ru/tok_media/?from=channel')).toBe(
      'https://dzen.ru/tok_media'
    )
  })

  it.each([
    'https://dzen.ru/video/watch/62b2294de1a1d65580ced2b1',
    'https://dzen.ru/media/id/123/article',
    'https://dzen.ru/shorts',
    'https://dzen.ru/search?text=foo',
    'https://dzen.ru/id/not-a-channel-id',
    `${PROFILE}/extra`,
    `${PROFILE}//`,
    PROFILE.replace('dzen.ru', 'dzen.ru.example.org'),
    PROFILE.replace('dzen.ru', 'user:password@dzen.ru'),
    PROFILE.replace('dzen.ru', 'dzen.ru:8080'),
    PROFILE.replace('https:', 'ftp:')
  ])('does not classify another resource as a profile: %s', (url) => {
    expect(normalizeDzenProfileUrl(url)).toBeNull()
  })

  it('fails incomplete discovery and forwards authentication settings', () => {
    const args = buildPlaylistInfoArgs(`${PROFILE}/?from=channel`, {
      cookiesPath: '/tmp/dzen-cookies.txt',
      proxy: 'http://localhost:1234'
    })
    expect(args).toContain('--flat-playlist')
    expect(args.lastIndexOf('--abort-on-error')).toBeGreaterThan(args.indexOf('--ignore-errors'))
    expect(args).toContain('/tmp/dzen-cookies.txt')
    expect(args).toContain('http://localhost:1234')
    expect(args.at(-1)).toBe(PROFILE)
  })

  it('preserves tolerant discovery for other sites', () => {
    const args = buildPlaylistInfoArgs('https://www.youtube.com/@example/videos', {})
    expect(args).toContain('--ignore-errors')
    expect(args).not.toContain('--abort-on-error')
  })
})
