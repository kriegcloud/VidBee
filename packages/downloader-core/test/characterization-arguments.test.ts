import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { buildCaptionExtractArgs, buildDownloadArgs, buildPlaylistInfoArgs, buildVideoInfoArgs, formatYtDlpCommand, resolveFfmpegLocationFromPath, resolvePathWithHome, sanitizeFilenameTemplate } from '@vidbee/downloader-core'
import { appendPlatformFilenameSafetyArgs, normalizeBrowserCookiesSettingForYtDlp, type YtDlpDownloadOptions, type YtDlpDownloadSettings } from '@vidbee/downloader-core/yt-dlp-args'
import { buildGalleryDlRuntimeArgs } from '@vidbee/downloader-core/instagram-profile'
import { getBrowserProfileBaseDirs, getBrowserProfileCandidates } from '@vidbee/downloader-core/cookie-browser-paths'

const url = 'https://www.youtube.com/watch?v=fixture'
const normalize = (value: unknown) => JSON.stringify(value).split(homedir()).join('<HOME>')
const settings: readonly [string, YtDlpDownloadSettings][] = [
  ['defaults', {}], ['empty', { browserForCookies: 'none', cookiesPath: ' ', configPath: ' ', proxy: ' ' }],
  ['auth-config', { browserForCookies: 'chrome:Default', cookiesPath: '/fixture/cookies.txt', configPath: '~/fixture.conf', proxy: ' http://proxy.invalid:8080 ' }],
  ['subtitles-off', { downloadSubtitles: false }], ['subs-sidecar', { embedSubs: false, writeAutoSubs: false, subtitleLanguages: ['zh-CN', 'en'], interfaceLanguage: 'de' }],
  ['embed-all', { embedThumbnail: true, embedMetadata: true, embedChapters: true }],
  ['embed-none', { embedThumbnail: false, embedMetadata: false, embedChapters: false }],
  ...(['classic', 'basic', 'pretty', 'nerdy'] as const).map((filenameStyle) => [filenameStyle, { filenameStyle }] as [string, YtDlpDownloadSettings]),
  ['naming', { filenameViaVidBee: true, shareWatermark: true, downloadPath: '/configured' }]
]

describe('pre-port exact argument arrays', () => {
  for (const [name, runtime] of settings) {
    it(`all four yt-dlp builders and gallery runtime: ${name}`, () => {
      expect(normalize({
        download: buildDownloadArgs({ url, type: 'video' }, '/fallback', runtime, ['--js-runtimes', 'node:/fixture/node']),
        video: buildVideoInfoArgs(url, runtime, ['--extra']),
        playlist: buildPlaylistInfoArgs(url, runtime, ['--extra']),
        captions: buildCaptionExtractArgs(url, '/caption/%(id)s', runtime, ['--extra'], ['en', 'zh-CN']),
        gallery: buildGalleryDlRuntimeArgs(runtime)
      })).toMatchSnapshot()
    })
  }
  const options: readonly [string, Partial<YtDlpDownloadOptions>][] = [
    ...(['auto', 'mp4', 'mkv', 'webm', 'original'] as const).map((containerFormat) => [containerFormat, { containerFormat }] as [string, Partial<YtDlpDownloadOptions>]),
    ['video-only', { format: '137', audioFormat: '' }], ['single-format', { format: '22' }],
    ['audio-id', { format: '137', audioFormat: '140' }], ['audio-multi', { format: '137', audioFormatIds: ['140', '251', ' '] }],
    ['existing-fallback', { format: '137/best', audioFormat: '140' }],
    ['audio', { type: 'audio' }], ['audio-format', { type: 'audio', format: '140', audioFormat: 'mp3' }],
    ['start', { startTime: '00:02' }], ['end', { endTime: '01:02' }], ['range', { startTime: '2', endTime: '5' }],
    ['custom-output', { customDownloadPath: '/override', customFilenameTemplate: '../unsafe\\name?:*/%(id)s. ' }],
    ['direct-video', { url: 'https://fixture.invalid/video.mp4' }], ['direct-image', { url: 'https://fixture.invalid/image.jpg' }]
  ]
  for (const [name, option] of options) it(`download option ${name}`, () => {
    expect(normalize(buildDownloadArgs({ url, type: 'video', ...option }, '/fallback', { downloadPath: '/configured', embedThumbnail: true }))).toMatchSnapshot()
  })
  for (const source of ['https://www.bilibili.com/video/BVfixture', 'https://twitch.tv/videos/123', 'https://tiktok.com/@fixture/video/123456', 'https://dzen.ru/fixture']) {
    for (const auth of [false, true]) it(`source-specific ${source} auth=${auth}`, () => {
      const runtime = { browserForCookies: auth ? 'firefox:profile' : 'none', writeAutoSubs: auth }
      expect(normalize({ download: buildDownloadArgs({ url: source, type: 'video' }, '/fallback', runtime), playlist: buildPlaylistInfoArgs(source, runtime) })).toMatchSnapshot()
    })
  }
  it.each(['win32', 'darwin', 'linux', 'freebsd'] as const)('injected platform %s', (platform) => {
    const args: string[] = []
    appendPlatformFilenameSafetyArgs(args, platform)
    expect(args).toMatchSnapshot()
    expect(normalize({ base: getBrowserProfileBaseDirs(platform, '/fixture/a/../home', 'chrome'), candidates: getBrowserProfileCandidates(platform, 'C:\\Fixture\\a\\..', 'opera') })).toMatchSnapshot()
  })
  it('home, FFmpeg, sanitization, quoting and cookie-profile helpers', () => {
    expect(normalize({ home: [resolvePathWithHome('~'), resolvePathWithHome('~/a/../b'), resolvePathWithHome(' ~\\file '), resolvePathWithHome('  '), resolvePathWithHome('~other/file')], ffmpeg: resolveFfmpegLocationFromPath('/fixture/bin/ffmpeg'), filename: sanitizeFilenameTemplate('../../a<>:\\b?*/%(title)s. '), command: formatYtDlpCommand(['', 'a b', 'x"y', "x'y", 'a\\b', '$literal']), cookies: ['none', ' safari:/a/profile ', 'firefox:/missing/profile', 'chrome:C:\\Users\\Fixture\\Default'].map(normalizeBrowserCookiesSettingForYtDlp) })).toMatchSnapshot()
  })
})

it('all browser target-platform path branches and database candidates', () => {
  const matrix = ['win32', 'darwin', 'linux', 'freebsd'].map((platform) => [platform, ['edge', 'chrome', 'chromium', 'brave', 'vivaldi', 'whale', 'opera', 'firefox', 'safari', 'unknown'].map((browser) => [browser, getBrowserProfileBaseDirs(platform, 'C:/fixture/a/../home', browser), getBrowserProfileCandidates(platform, 'C:/fixture/a/../home', browser)])])
  expect(matrix).toMatchSnapshot()
})
it('audio output naming matrix and runtime arguments preserve caller order', () => {
  expect(['classic', 'basic', 'pretty', 'nerdy'].map((style) => buildDownloadArgs({ url, type: 'audio', audioFormat: 'flac', startTime: '1:02', endTime: '2:03' }, '/fallback', { filenameStyle: style === 'classic' ? 'classic' : style === 'basic' ? 'basic' : style === 'pretty' ? 'pretty' : 'nerdy', filenameViaVidBee: false, shareWatermark: false }, ['--limit-rate', '1M', '--retries', '1']))).toMatchSnapshot()
})

it('exact guidance strings and time-range validation errors', () => {
  const inputs = [
    { url: 'https://fixture.invalid/segment.m4s', type: 'video' as const },
    { url: 'https://onlyfans.com/fixture', type: 'video' as const },
    { url: 'https://fansly.com/fixture', type: 'video' as const },
    { url, type: 'video' as const, startTime: 'bad' },
    { url, type: 'video' as const, startTime: '2', endTime: '1' },
    { url, type: 'video' as const, endTime: '-1' }
  ]
  expect(inputs.map((options) => { try { return buildDownloadArgs(options, '/fixture', {}) } catch (error) { return error instanceof Error ? [error.name, error.message] : error } })).toMatchSnapshot()
})
