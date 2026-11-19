import { describe, expect, it } from '@effect/vitest'
import {
  CAPTURE_FPS,
  CAPTURE_X264_CRF,
  DRM_FALLBACK_MESSAGE,
  VIRTUAL_DISPLAY_SIZE,
  capturePageUrl,
  encodeSidecarEvent,
  evenSize,
  isDrmProtectedMessage,
  parseNetscapeCookieFile,
  parseSidecarEvent,
  playbackPageUrl
} from '@vidbee/browser-capture'
import { fanslyAdapter, fanslyItems, fanslyMediaUrl } from '@vidbee/browser-capture/fansly-profile'
import {
  chatVideoAttachments,
  chatVideoByOrdinal,
  onlyFansChatMediaResponse,
  onlyFansChatResponse,
  onlyFansItems,
  onlyFansMediaUrl,
  onlyFansPurchasedResponse
} from '@vidbee/browser-capture/onlyfans-profile'
import type { OnlyFansProfile } from '@vidbee/downloader-core/onlyfans-profile'

const original = 'https://cdn2.onlyfans.com/files/original.mp4?Signature=synthetic'
const onlyFansPayload = {
  list: [{
    id: 100,
    messageId: '200',
    postId: '300',
    media: [
      { id: 1, type: 'photo', files: { full: { url: original } } },
      {
        id: '2', type: 'video', duration: '12.5',
        files: {
          full: { url: original },
          source: { url: 'https://cdn.onlyfans.com/files/source.mp4' },
          drm: { manifest: true },
          thumb: { url: 'https://outside.test/thumb.jpg' },
          preview: { url: 'https://user:pass@cdn2.onlyfans.com:8443/preview.jpg?secret=synthetic' }
        }
      },
      { id: 3, type: 'video', duration: true, canView: false, files: { full: { url: original } } },
      { id: 4, type: 'video', duration: 0, files: { drm: { manifest: true } } },
      { id: 5, type: 'gif', files: {} },
      { id: 6, type: 'audio', src: original },
      null,
      { id: 'bad', type: 'video', src: original }
    ]
  }]
}
const onlyFansExpected = [
  { item: { id: '1', postId: '200', category: 'photos', state: 'available', downloaded: false }, mediaUrl: original },
  { item: { id: '2', postId: '200', category: 'videos', state: 'available', downloaded: false }, mediaUrl: original },
  { item: { id: '3', postId: '200', category: 'videos', state: 'locked', downloaded: false }, mediaUrl: null },
  { item: { id: '4', postId: '200', category: 'videos', state: 'drm', downloaded: false }, mediaUrl: null },
  { item: { id: '5', postId: '200', category: 'photos', state: 'locked', downloaded: false }, mediaUrl: null }
]

// Public specifiers deliberately keep this baseline independent of source-file layout.
describe('public pure browser-capture characterization', () => {
  it('pins capture constants and complete even-size results, including fractional and non-finite values', () => {
    expect({ VIRTUAL_DISPLAY_SIZE, CAPTURE_FPS, CAPTURE_X264_CRF, DRM_FALLBACK_MESSAGE }).toEqual({
      VIRTUAL_DISPLAY_SIZE: { width: 3840, height: 3840 },
      CAPTURE_FPS: 60,
      CAPTURE_X264_CRF: 12,
      DRM_FALLBACK_MESSAGE: '[VidBeep] Source is DRM protected; recording in-browser playback on a virtual display.'
    })
    expect([
      evenSize(1919, 1080), evenSize(1, -3), evenSize(2.5, 3.5), evenSize(0, 0),
      evenSize(Number.NaN, Number.POSITIVE_INFINITY)
    ]).toEqual([
      { width: 1920, height: 1080 }, { width: 2, height: 2 }, { width: 3, height: 5 },
      { width: 2, height: 2 }, { width: Number.NaN, height: Number.NaN }
    ])
  })

  it('pins URL normalization, chat anchor selection and both DRM patterns', () => {
    const chat = 'https://www.onlyfans.com/my/chats/chat/7/?firstId=123#video'
    expect([
      playbackPageUrl('https://example.test/post/media/004/?signed=value#hash'),
      playbackPageUrl('https://onlyfans.com/my/chats/chat/7/media/9?filter=videos'),
      playbackPageUrl('https://onlyfans.com/my/chats/chat/7/'),
      playbackPageUrl('not a URL'),
      capturePageUrl(chat, 2), capturePageUrl(chat, 0), capturePageUrl(chat, 0.5),
      capturePageUrl('http://onlyfans.com/my/chats/chat/7?firstId=123', 1)
    ]).toEqual([
      'https://example.test/post?media=004',
      'https://onlyfans.com/my/chats/chat/7/gallery?media=9',
      'https://onlyfans.com/my/chats/chat/7/', 'not a URL',
      'https://www.onlyfans.com/my/chats/chat/7/?firstId=123',
      'https://www.onlyfans.com/my/chats/chat/7/',
      'https://www.onlyfans.com/my/chats/chat/7/?firstId=123',
      'http://onlyfans.com/my/chats/chat/7/gallery'
    ])
    expect(['DRM PROTECTED', 'Known To Use DRM Protection', 'drm protection', '', 'unsupported codec']
      .map(isDrmProtectedMessage)).toEqual([true, true, false, false, false])
  })

  it('pins successful wrong-kind scalar results and natural failures without engine error text', () => {
    for (const value of [null, false, true, 0, 42, Number.NaN]) {
      expect(Reflect.apply(playbackPageUrl, undefined, [value])).toEqual(value)
      expect(Reflect.apply(capturePageUrl, undefined, [value])).toEqual(value)
      expect(() => Reflect.apply(parseNetscapeCookieFile, undefined, [value])).toThrow()
      expect(() => Reflect.apply(isDrmProtectedMessage, undefined, [value])).toThrow()
      expect(() => Reflect.apply(parseSidecarEvent, undefined, [value])).toThrow()
    }
    expect([null, false, true, '3', 'invalid'].map((width) => Reflect.apply(evenSize, undefined, [width, 2])))
      .toEqual([
        { width: 2, height: 2 }, { width: 2, height: 2 }, { width: 2, height: 2 },
        { width: 31, height: 2 }, { width: Number.NaN, height: 2 }
      ])
  })

  it('pins cookie trimming, tabs, expiry parsing, missing fields and comment policy', () => {
    expect(parseNetscapeCookieFile([
      '', '# comment', 'short\trow',
      '#HttpOnly_.example.test\tTRUE\t\ttRuE\t12junk\tsession\tvalue\twith-tab',
      '.example.test\tFALSE\t/path\tFALSE\tnot-a-number\tplain\tvalue',
      '\tTRUE\t/\tTRUE\t1\tmissing-domain\tvalue',
      'example.test\tTRUE\t/\tTRUE\t1\t\tmissing-name',
      ' example.test\tTRUE\t/\tTRUE\t-5\ttrimmed\t padded  '
    ].join('\r\n'))).toEqual([
      { domain: '.example.test', path: '/', secure: true, expires: 12, name: 'session', value: 'value\twith-tab', httpOnly: true },
      { domain: '.example.test', path: '/path', secure: false, expires: 0, name: 'plain', value: 'value', httpOnly: false },
      { domain: 'example.test', path: '/', secure: true, expires: -5, name: 'trimmed', value: ' padded', httpOnly: false }
    ])
  })

  it('pins exact wire bytes and all producer event shapes', () => {
    const events = [
      { type: 'spawn', pid: 12 }, { type: 'log', message: 'line\n雪' },
      { type: 'progress', percent: 0.25, currentTime: 1, duration: 4 },
      { type: 'done', filePath: '/synthetic/out.mp4', size: 4, durationMs: null },
      { type: 'error', message: 'failure' }
    ] as const
    expect(events.map(encodeSidecarEvent)).toEqual([
      '__VIDBEE_CAPTURE__{"type":"spawn","pid":12}',
      '__VIDBEE_CAPTURE__{"type":"log","message":"line\\n雪"}',
      '__VIDBEE_CAPTURE__{"type":"progress","percent":0.25,"currentTime":1,"duration":4}',
      '__VIDBEE_CAPTURE__{"type":"done","filePath":"/synthetic/out.mp4","size":4,"durationMs":null}',
      '__VIDBEE_CAPTURE__{"type":"error","message":"failure"}'
    ])
    expect(events.map((event) => parseSidecarEvent(` \t${encodeSidecarEvent(event)}\r\n`))).toEqual(events)
    expect(encodeSidecarEvent({ type: 'progress', percent: Number.NaN, currentTime: Number.POSITIVE_INFINITY, duration: 1 }))
      .toBe('__VIDBEE_CAPTURE__{"type":"progress","percent":null,"currentTime":null,"duration":1}')
  })

  it('pins permissive old protocol envelopes separately from malformed syntax', () => {
    expect(['plain text', '__VIDBEE_CAPTURE__{', '__VIDBEE_CAPTURE__null', '__VIDBEE_CAPTURE__[]',
      '__VIDBEE_CAPTURE__{"pid":1}', '__VIDBEE_CAPTURE__false'].map(parseSidecarEvent))
      .toEqual([null, null, null, null, null, null])
    const envelopes = [
      { type: 'future', extra: [1] }, { type: null }, { type: 42 },
      { type: 'spawn', pid: 'ignored' }, { type: 'log' }, { type: 'log', message: null },
      { type: 'error', message: 1 }, { type: 'progress', percent: '1', currentTime: null, duration: false },
      { type: 'done', filePath: 1, size: 'ignored', durationMs: 'bad' }
    ]
    expect(envelopes.map((value) => parseSidecarEvent(`__VIDBEE_CAPTURE__${JSON.stringify(value)}`)))
      .toEqual(envelopes)
  })
})

describe('public OnlyFans pure characterization', () => {
  it('pins signed URL allowlists, canonicalization and wrong-kind JSON values', () => {
    const values = [null, false, 0, Number.NaN, {}, [], '', 'not a URL',
      original, 'https://CDN.onlyfans.com:443/files/a.mp4',
      'https://cdn.onlyfans.com:8443/files/a.mp4', 'https://user@cdn.onlyfans.com/files/a.mp4',
      'http://cdn.onlyfans.com/files/a.mp4', 'https://cdn.onlyfans.com/preview/a.jpg',
      'https://cdn.onlyfans.com.evil.test/files/a.mp4']
    expect(values.map(onlyFansMediaUrl)).toEqual([
      null, null, null, null, null, null, null, null, original,
      'https://cdn.onlyfans.com/files/a.mp4', null, null, null, null, null
    ])
  })

  it('pins all extraction envelopes and complete items, precedence, accessibility and DRM', () => {
    expect(onlyFansItems(onlyFansPayload)).toEqual(onlyFansExpected)
    for (const key of ['list', 'items', 'data', 'media', 'messages', 'posts']) {
      expect(onlyFansItems({ [key]: onlyFansPayload.list })).toEqual(onlyFansExpected)
    }
    expect(onlyFansItems(onlyFansPayload.list)).toEqual(onlyFansExpected)
    expect(onlyFansItems(onlyFansPayload.list[0])).toEqual(onlyFansExpected)
    expect(onlyFansItems({ list: [], items: onlyFansPayload.list })).toEqual([])
    expect(onlyFansItems({ id: 9, postId: 10, type: 'video', videoSources: {
      720: 'https://cdn.onlyfans.com/files/720.mp4',
      2160: 'https://outside.test/2160.mp4', 1080: 'https://cdn.onlyfans.com/files/1080.mp4'
    } })).toEqual([{
      item: { id: '9', postId: '10', category: 'videos', state: 'available', downloaded: false },
      mediaUrl: 'https://cdn.onlyfans.com/files/1080.mp4'
    }])
    for (const value of [null, false, true, 0, Number.NaN, '', 'text', [], { list: [null, {}, false] }]) {
      expect(onlyFansItems(value)).toEqual([])
      expect(chatVideoAttachments(value)).toEqual([])
    }
  })

  it('pins source fallback, parent locking and mutable extraction results', () => {
    const source = 'https://cdn.onlyfans.com/files/source.mp4'
    const src = 'https://cdn.onlyfans.com/files/src.mp4'
    const sources = { 1080: 'https://cdn.onlyfans.com/files/1080.mp4' }
    expect(onlyFansItems({ id: '10', media: [
      { id: 1, type: 'video', files: { full: { url: 'https://outside.test/full.mp4' }, source: { url: source } }, src, videoSources: sources },
      { id: 2, type: 'video', files: {}, src, videoSources: sources }
    ] })).toEqual([
      { item: { id: '1', postId: '10', category: 'videos', state: 'available', downloaded: false }, mediaUrl: source },
      { item: { id: '2', postId: '10', category: 'videos', state: 'available', downloaded: false }, mediaUrl: src }
    ])
    expect(onlyFansItems({ id: 10, canViewMedia: false, media: [{ id: 1, type: 'video', src: original }] }))
      .toEqual([{ item: { id: '1', postId: '10', category: 'videos', state: 'locked', downloaded: false }, mediaUrl: null }])
    const result = onlyFansItems(onlyFansPayload)
    const first = result[0]
    if (!first) throw new Error('Missing synthetic item')
    first.item.downloaded = true
    result.pop()
    expect(onlyFansItems(onlyFansPayload)).toEqual(onlyFansExpected)
  })

  it('pins positive finite duration coercion and rejects every other numeric result', () => {
    const durations = [null, false, true, '', '3.25', 'invalid', 0, -2, Number.NaN, Number.POSITIVE_INFINITY]
    expect(chatVideoAttachments({ list: [{ id: 10, media: durations.map((duration, index) => ({
      id: index + 1, type: 'video', duration
    })) }] })).toEqual([null, null, 1, null, 3.25, null, null, null, null, null].map((durationSec, index) => ({
      id: String(index + 1), postId: '10', state: 'locked', durationSec, previewPath: null
    })))
  })

  it('pins chat duration coercion, preview path, ordinal order and metadata envelope asymmetry', () => {
    const expected = [
      { id: '2', postId: '200', state: 'available', durationSec: 12.5, previewPath: '/preview.jpg' },
      { id: '3', postId: '200', state: 'locked', durationSec: 1, previewPath: null },
      { id: '4', postId: '200', state: 'drm', durationSec: null, previewPath: null }
    ]
    expect(chatVideoAttachments(onlyFansPayload)).toEqual(expected)
    expect([1, 2, 3, 4, 0, -1, 1.5, Number.NaN].map((ordinal) => chatVideoByOrdinal(onlyFansPayload, ordinal)))
      .toEqual([expected[0], expected[1], expected[2], null, null, null, null, null])
    expect(chatVideoAttachments({ items: onlyFansPayload.list })).toEqual(expected.map((entry) => ({
      ...entry, durationSec: null, previewPath: null
    })))
    expect(chatVideoAttachments({ list: [
      { id: 1, media: [{ id: 2, type: 'video', duration: 3 }] },
      { id: 4, media: [{ id: 2, type: 'video', duration: 9 }] }
    ] })).toEqual([
      { id: '2', postId: '1', state: 'locked', durationSec: 9, previewPath: null },
      { id: '2', postId: '4', state: 'locked', durationSec: 9, previewPath: null }
    ])
  })

  it('pins exact response routes, query omission and purchased user-alias precedence', () => {
    expect([
      onlyFansChatResponse(new URL('https://onlyfans.com/api2/v2/chats/7/messages?filter=photos'), '7'),
      onlyFansChatResponse(new URL('https://www.onlyfans.com/api2/v2/chats/7/messages'), '7'),
      onlyFansChatResponse(new URL('https://onlyfans.com/api2/v2/chats/8/messages'), '7'),
      onlyFansChatResponse(new URL('https://onlyfans.com/api2/v2/chats/7/messages/'), '7'),
      onlyFansChatMediaResponse(new URL('https://onlyfans.com/api2/v2/chats/7/media?filter=photos'), '7'),
      onlyFansChatMediaResponse(new URL('https://onlyfans.com/api2/v2/chats/7/media?filter=photos'), '7', 'videos'),
      onlyFansChatMediaResponse(new URL('https://onlyfans.com/api2/v2/chats/7/media'), '7', 'messages'),
      ...['userId=7', 'user_id=7', 'user=7', 'userId=8&user_id=7', 'userId=&user=7', 'userId=7&filter=photos', '']
        .map((query) => onlyFansPurchasedResponse(new URL(`https://onlyfans.com/api2/v2/posts/paid?${query}`), '7'))
    ]).toEqual([true, false, false, false, true, true, false, true, true, true, false, false, true, false])
  })
})

const profile: OnlyFansProfile = {
  username: 'example', profileUrl: 'https://fansly.com/example', state: 'idle', updatedAt: 0, pages: 0, items: []
}
const fanslyOriginal = 'https://cdn.fansly.com/original.mp4?Signature=synthetic'
const fanslyItem = { id: '1', postId: '100', category: 'videos', state: 'available', downloaded: false } as const

describe('public Fansly pure characterization', () => {
  it('pins CDN allowlists, default port normalization and malformed values', () => {
    expect([null, false, 1, Number.NaN, {}, [], '', fanslyOriginal,
      'https://VIDEO2.FANSLY.COM:443/a.mp4', 'https://video2.sub.fansly.com/a.mp4',
      'https://fansly.com/a.mp4', 'https://apiv3.fansly.com/a.mp4',
      'http://cdn.fansly.com/a.mp4', 'https://cdn.fansly.com:444/a.mp4',
      'https://user:pass@cdn.fansly.com/a.mp4', 'https://cdn.fansly.com.evil.test/a.mp4']
      .map(fanslyMediaUrl)).toEqual([
        null, null, null, null, null, null, null, fanslyOriginal,
        'https://video2.fansly.com/a.mp4', 'https://video2.sub.fansly.com/a.mp4',
        null, null, null, null, null, null
      ])
  })

  it('pins bundle/correlation identities, variant order, access states and string-only IDs', () => {
    const media = (id: unknown, access: unknown, locations: unknown[], variants: unknown[] = []) => ({
      id, access, media: { mimetype: 'video/mp4', locations, variants }
    })
    const payload = { response: {
      posts: [{ id: '100', attachments: [{ contentId: '9' }] }],
      accountMediaBundles: [{ id: '9', accountMediaIds: ['1', '2'], content: [{ accountMediaId: '3' }, { accountMediaId: '4' }] }],
      data: [{ correlationId: '200', locationId: 'not-the-post', mediaOfferId: '2' }],
      accountMedia: [
        media('1', true, [{ location: fanslyOriginal }]),
        media('2', false, [{ location: fanslyOriginal }]),
        media('3', true, [], [
          { height: 720, mimetype: 'video/mp4', locations: [{ location: 'https://cdn.fansly.com/720.mp4' }] },
          { height: 2160, nsfwBlock: true, mimetype: 'video/mp4', locations: [{ location: 'https://cdn.fansly.com/2160.mp4' }] },
          { height: 1080, mimetype: 'video/mp4', locations: [{ location: 'https://cdn.fansly.com/1080.mp4' }] }
        ]),
        media('4', true, [{ location: 'https://cdn.fansly.com/stream.m3u8' }]),
        media(1, true, [{ location: fanslyOriginal }]),
        media('5', true, [{ location: fanslyOriginal }])
      ],
      aggregationData: { accountMedia: [media('1', undefined, [])] }
    } }
    expect(fanslyItems(payload)).toEqual([
      { item: fanslyItem, mediaUrl: fanslyOriginal },
      { item: { ...fanslyItem, id: '2', postId: '200', state: 'locked' }, mediaUrl: null },
      { item: { ...fanslyItem, id: '3' }, mediaUrl: 'https://cdn.fansly.com/1080.mp4' },
      { item: { ...fanslyItem, id: '4', state: 'unsupported' }, mediaUrl: null },
      { item: { ...fanslyItem, state: 'locked' }, mediaUrl: null }
    ])
    for (const value of [null, false, true, 0, Number.NaN, '', 'text', [], { response: { posts: [null] } }]) {
      expect(fanslyItems(value)).toEqual([])
    }
  })

  it('pins aggregation bundleContent and image-versus-video MIME selection', () => {
    expect(fanslyItems({ response: {
      data: [{ mediaOfferId: '9', mediaOfferBundleId: '8', correlationId: '100' }],
      aggregationData: {
        accountMediaBundles: [{ id: '8', bundleContent: [{ accountMediaId: '1' }, { accountMediaId: '2' }] }],
        accountMedia: [
          { id: '1', access: true, media: { mimetype: 'image/jpeg', locations: [{ location: 'https://image.fansly.com/a.JPG?sig=synthetic' }] } },
          { id: '2', access: true, media: { mimetype: 'application/x-mpegurl', variants: [
            { mimetype: 'image/jpeg', locations: [{ location: 'https://cdn.fansly.com/preview.jpg' }] }
          ] } }
        ]
      }
    } })).toEqual([
      { item: { id: '1', postId: '100', category: 'photos', state: 'available', downloaded: false }, mediaUrl: 'https://image.fansly.com/a.JPG?sig=synthetic' },
      { item: { id: '2', postId: '100', category: 'videos', state: 'unsupported', downloaded: false }, mediaUrl: null }
    ])
  })

  it('pins every supplied adapter calculation and its mutable public descriptor', () => {
    expect({ name: fanslyAdapter.name, key: fanslyAdapter.key, origin: fanslyAdapter.origin,
      requiresCookies: fanslyAdapter.requiresCookies }).toEqual({
      name: 'Fansly', key: 'fansly', origin: 'https://fansly.com', requiresCookies: false
    })
    expect(fanslyAdapter.normalize('https://www.fansly.com/Example/media')).toEqual({ username: 'example', profileUrl: profile.profileUrl })
    expect(fanslyAdapter.isSite('https://fansly.com/example')).toBe(true)
    expect(fanslyAdapter.isSite('https://outside.test/example')).toBe(false)
    expect(fanslyAdapter.items).toBe(fanslyItems)
    expect([
      fanslyAdapter.ownerResponse(new URL('https://apiv3.fansly.com/api/v1/account?usernames=OTHER,EXAMPLE'), 'example'),
      fanslyAdapter.ownerResponse(new URL('https://fansly.com/api/v1/account?usernames=example'), 'example'),
      fanslyAdapter.ownerResponse(new URL('https://apiv3.fansly.com/api/v1/account?usernames=example'), 'EXAMPLE'),
      ...['timeline/12', 'timelinenew/12', 'mediaoffers/location?accountId=12', 'timeline/13', 'message?accountId=12']
        .map((route) => fanslyAdapter.feedResponse(new URL(`https://apiv3.fansly.com/api/v1/${route}`), '12', profile)),
      fanslyAdapter.refreshResponse(new URL('https://apiv3.fansly.com/api/v1/post?ids=99,100'), fanslyItem, profile),
      fanslyAdapter.refreshResponse(new URL('https://apiv3.fansly.com/api/v1/post?ids=1000'), fanslyItem, profile)
    ]).toEqual([true, false, false, true, true, true, false, false, true, false])
    expect([
      fanslyAdapter.ownerId({ response: [{ username: 'EXAMPLE', id: '12' }] }, 'example'),
      fanslyAdapter.ownerId({ response: [{ username: 'example', id: 12 }] }, 'example'),
      fanslyAdapter.ownerId(null, 'example')
    ]).toEqual(['12', null, null])
    expect([null, {}, { response: { hasMore: false } }, { response: { posts: [] } },
      { response: { data: [] } }, { response: { posts: [{}], hasMore: true } }].map(fanslyAdapter.complete))
      .toEqual([false, false, true, true, true, false])
    expect({ queue: fanslyAdapter.queueUrl(fanslyItem, profile), refresh: fanslyAdapter.refreshUrl(fanslyItem, profile),
      scroll: fanslyAdapter.scrollMode(profile) }).toEqual({
      queue: 'https://fansly.com/example/posts', refresh: 'https://fansly.com/post/100', scroll: { nested: true, chat: false }
    })
    const descriptor = Object.getOwnPropertyDescriptor(fanslyAdapter, 'name')
    expect({ writable: descriptor?.writable, configurable: descriptor?.configurable, frozen: Object.isFrozen(fanslyAdapter) })
      .toEqual({ writable: true, configurable: true, frozen: false })
  })
})
