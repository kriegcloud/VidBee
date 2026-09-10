import { TaskKindSchema, TRANSCRIBABLE_TASK_KINDS } from '@vidbee/task-queue'
import { describe, expect, it } from 'vitest'
import { normalizeFacebookGalleryUrl } from '../src/facebook-gallery'
import {
  resolveDownloadTaskKind,
  resolveGalleryDlFilenameTemplate,
  shouldUseGalleryDl
} from '../src/gallery-dl-executor'

describe('Facebook gallery routing', () => {
  it.each([
    [
      'https://www.facebook.com/profile.php?id=100011267106830&sk=photos',
      '/100011267106830/photos'
    ],
    ['https://m.facebook.com/profile.php?sk=photos_by&id=123&utm_source=test', '/123/photos'],
    ['https://facebook.com/profile.php?id=123&sk=photos_albums', '/123/photos_albums'],
    ['https://www.facebook.com/vidbee.example/', '/vidbee.example/photos'],
    ['https://www.facebook.com/vidbee.example/photos_by/', '/vidbee.example/photos'],
    ['https://www.facebook.com/people/Example/123/photos/', '/123/photos'],
    ['https://www.facebook.com/people/Example/123/', '/123/photos'],
    [
      'http://ignored:credentials@mbasic.facebook.com:8080/123/photos?tracking=1#fragment',
      '/123/photos'
    ],
    ['https://www.facebook.com/123/photos_albums/', '/123/photos_albums'],
    ['https://www.facebook.com/media/set/?set=a.12345&type=3', '/media/set/?set=a.12345'],
    ['https://www.facebook.com/photo.php?fbid=123&set=a.456', '/photo/?fbid=123'],
    [
      'https://www.facebook.com/photo/?fbid=123&set=pb.456.-2207520000&setextract',
      '/photo/?fbid=123&set=pb.456.-2207520000&setextract'
    ],
    ['https://www.facebook.com/example/photos/a.456/123/', '/photo/?fbid=123']
  ])('canonicalizes %s before passing it to the authenticated extractor', (input, canonical) => {
    expect(normalizeFacebookGalleryUrl(input)?.url).toBe(`https://www.facebook.com${canonical}`)
    expect(shouldUseGalleryDl(input)).toBe(true)
    expect(resolveDownloadTaskKind(input, 'video')).toBe('facebook-gallery')
    expect(resolveDownloadTaskKind(input, 'audio')).toBe('facebook-gallery')
  })

  it.each([
    'https://www.facebook.com/watch/?v=123',
    'https://www.facebook.com/reel/123',
    'https://www.facebook.com/example/videos/123',
    'https://www.facebook.com/example/posts/123',
    'https://www.facebook.com/share/v/123',
    'https://www.facebook.com/profile.php?id=123&sk=videos',
    'https://www.facebook.com/profile.php?sk=photos',
    'https://www.facebook.com/profile.php?id=../escape&sk=photos',
    'https://www.facebook.com/media/set/?set=../../escape',
    'https://www.facebook.com/photo/?fbid=oops',
    'https://www.facebook.com/login/',
    'https://www.facebook.com/groups/example',
    'https://www.facebook.com/',
    'https://www.facebook.com/example/photos/extra',
    'https://www.facebook.com/%2e%2e%2fescape/photos',
    'https://facebook.com.example.org/example/photos',
    'https://example.org/facebook.com/example/photos',
    'ftp://www.facebook.com/example/photos',
    'invalid'
  ])('leaves unsupported or video routes alone: %s', (input) => {
    expect(normalizeFacebookGalleryUrl(input)).toBeNull()
    expect(shouldUseGalleryDl(input)).toBe(false)
    expect(resolveDownloadTaskKind(input, 'video')).toBe('video')
  })

  it('uses stable media IDs even with a saved Instagram or video naming template', () => {
    expect(
      resolveGalleryDlFilenameTemplate('https://www.facebook.com/123/photos', {
        galleryDlFilenameTemplate: '{media_id}.{extension}',
        customFilenameTemplate: '%(title)s.%(ext)s'
      })
    ).toBe('{id}.{extension}')
  })

  it('stores a multi-file task without automatic transcription', () => {
    expect(TaskKindSchema.parse('facebook-gallery')).toBe('facebook-gallery')
    expect(TRANSCRIBABLE_TASK_KINDS.has('facebook-gallery')).toBe(false)
    expect(
      normalizeFacebookGalleryUrl('https://www.facebook.com/profile.php?id=123&sk=photos')
        ?.directorySegments
    ).toEqual(['Facebook', '123', 'Photos'])
  })
})
