import { TaskKindSchema, TRANSCRIBABLE_TASK_KINDS } from '@vidbee/task-queue'
import { describe, expect, it } from 'vitest'
import {
  resolveDownloadTaskKind,
  resolveGalleryDlFilenameTemplate,
  shouldUseGalleryDl
} from '../src/gallery-dl-executor'
import { normalizeTikTokPhotoUrl } from '../src/tiktok-photo'

describe('TikTok photo routing', () => {
  it.each([
    [
      'https://www.tiktok.com/@chillezy/photo/7240568259186019630',
      'https://www.tiktok.com/@chillezy/photo/7240568259186019630',
      ['TikTok', 'chillezy', '7240568259186019630']
    ],
    [
      'https://tiktok.com/@hull.city_1904/photo/7553302113757990166/?lang=en&q=x#top',
      'https://www.tiktok.com/@hull.city_1904/photo/7553302113757990166',
      ['TikTok', 'hull.city_1904', '7553302113757990166']
    ],
    [
      'http://ignored:credentials@m.tiktok.com:8080/@memezar/photo/7449708266168274208',
      'https://www.tiktok.com/@memezar/photo/7449708266168274208',
      ['TikTok', 'memezar', '7449708266168274208']
    ],
    [
      'https://www.tiktok.com/share/photo/7449708266168274208',
      'https://www.tiktok.com/share/photo/7449708266168274208',
      ['TikTok', 'Photos', '7449708266168274208']
    ]
  ])('canonicalizes %s for gallery-dl', (input, canonical, segments) => {
    const normalized = normalizeTikTokPhotoUrl(input)
    expect(normalized?.url).toBe(canonical)
    expect(normalized?.directorySegments).toEqual(segments)
    expect(shouldUseGalleryDl(input)).toBe(true)
    expect(resolveDownloadTaskKind(input, 'video')).toBe('tiktok-photo')
    expect(resolveDownloadTaskKind(input, 'audio')).toBe('tiktok-photo')
  })

  it.each([
    'https://www.tiktok.com/@tiktok/video/7683195368279985438',
    'https://www.tiktok.com/@tiktok',
    'https://www.tiktok.com/@tiktok/posts',
    'https://vm.tiktok.com/ZMabc123/',
    'https://www.tiktok.com/@tiktok/photo/not-a-number',
    'https://www.tiktok.com/@tiktok/photo/123',
    'https://www.tiktok.com/@tiktok/photo/7240568259186019630/extra',
    'https://www.tiktok.com/tiktok/photo/7240568259186019630',
    'https://www.tiktok.com/@/photo/7240568259186019630',
    'https://www.tiktok.com/@%2e%2e%2f/photo/7240568259186019630',
    'https://tiktok.com.example.org/@tiktok/photo/7240568259186019630',
    'https://example.org/tiktok.com/@tiktok/photo/7240568259186019630',
    'ftp://www.tiktok.com/@tiktok/photo/7240568259186019630',
    'invalid'
  ])('leaves %s on the yt-dlp path', (input) => {
    expect(normalizeTikTokPhotoUrl(input)).toBeNull()
    expect(shouldUseGalleryDl(input)).toBe(false)
    expect(resolveDownloadTaskKind(input, 'video')).toBe('video')
  })

  it('numbers photo-mode files and ignores user filename templates', () => {
    const url = 'https://www.tiktok.com/@chillezy/photo/7240568259186019630'
    expect(resolveGalleryDlFilenameTemplate(url, {})).toBe('{id}_{num:>02}.{extension}')
    expect(
      resolveGalleryDlFilenameTemplate(url, {
        customFilenameTemplate: '12.%(ext)s',
        galleryDlFilenameTemplate: '{title}.{extension}'
      })
    ).toBe('{id}_{num:>02}.{extension}')
  })

  it('registers the task kind without making it transcribable', () => {
    expect(TaskKindSchema.parse('tiktok-photo')).toBe('tiktok-photo')
    expect(TRANSCRIBABLE_TASK_KINDS.has('tiktok-photo' as never)).toBe(false)
  })
})
