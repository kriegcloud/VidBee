import { describe, expect, it } from 'vitest'
import {
  BROWSER_CAPTURE_GROUP_KEY,
  mapPlaylistInfo,
  planPlaylistDownloadOrder,
  playlistEntryGroupKey
} from '../src/playlist-plan'

describe('planPlaylistDownloadOrder', () => {
  it('queues DRM recordings before videos and photos', () => {
    const planned = planPlaylistDownloadOrder([
      {
        id: 'p',
        title: 'photo',
        url: 'https://onlyfans.com/1/u/media/1',
        index: 1,
        mediaKind: 'photo'
      },
      {
        id: 'v',
        title: 'video',
        url: 'https://onlyfans.com/1/u/media/2',
        index: 2,
        mediaKind: 'video'
      },
      {
        id: 'r',
        title: 'recording',
        url: 'https://onlyfans.com/1/u/media/3',
        index: 3,
        mediaKind: 'recording'
      }
    ])
    expect(planned.map((entry) => entry.id)).toEqual(['r', 'v', 'p'])
  })
})

describe('playlistEntryGroupKey', () => {
  it('caps recordings on the shared browser-capture group', () => {
    expect(playlistEntryGroupKey({ mediaKind: 'recording' }, 'playlist:1')).toBe(
      BROWSER_CAPTURE_GROUP_KEY
    )
    expect(playlistEntryGroupKey({ mediaKind: 'photo' }, 'playlist:1')).toBe('playlist:1')
  })
})

describe('mapPlaylistInfo', () => {
  it('keeps thumbnails and media kinds from yt-dlp JSON', () => {
    const playlist = mapPlaylistInfo(
      {
        id: 'chat',
        title: 'Chat',
        entries: [
          {
            id: '9',
            title: 'clip',
            url: 'https://onlyfans.com/my/chats/chat/1/media/9',
            thumbnail: 'https://cdn.example/preview.jpg',
            media_type: 'recording'
          }
        ]
      },
      'fallback'
    )
    expect(playlist.entries[0]).toMatchObject({
      thumbnail: 'https://cdn.example/preview.jpg',
      mediaKind: 'recording'
    })
  })
})
