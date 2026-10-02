import { FanslyCommandSchema, fanslyProfile } from '@vidbee/downloader-core/fansly-profile'
import { describe, expect, it } from 'vitest'
import { fanslyAdapter, fanslyItems, fanslyMediaUrl } from '../src/fansly-profile'

const media = (id: string, access = true) => ({
  id,
  access,
  media: {
    mimetype: 'image/jpeg',
    locations: [{ location: `https://cdn.fansly.com/media/${id}.jpg?Signature=secret` }]
  },
  preview: {
    mimetype: 'image/jpeg',
    locations: [{ location: 'https://cdn.fansly.com/preview.jpg' }]
  }
})
describe('Fansly profiles', () => {
  it('normalizes both supported tabs and rejects unrelated routes and hosts', () => {
    for (const tab of ['posts', 'media']) {
      expect(fanslyProfile(`https://www.fansly.com/Example/${tab}`)).toEqual({
        username: 'example',
        profileUrl: 'https://fansly.com/example'
      })
    }
    for (const url of [
      'https://evil.test/example/media',
      'https://fansly.com/messages',
      'https://fansly.com/post/123',
      'https://fansly.com/example/messages',
      'https://fansly.com@evil.test/example/media'
    ]) {
      expect(fanslyProfile(url)).toBeNull()
    }
    expect(
      FanslyCommandSchema.parse({ url: 'https://fansly.com/example', action: 'map' }).category
    ).toBe('media')
  })
  it('matches only the selected creator feed, never recommendations or chat media', () => {
    expect(
      fanslyAdapter.feedResponse(new URL('https://apiv3.fansly.com/api/v1/timeline/12'), '12')
    ).toBe(true)
    expect(
      fanslyAdapter.feedResponse(new URL('https://apiv3.fansly.com/api/v1/timeline/13'), '12')
    ).toBe(false)
    expect(
      fanslyAdapter.feedResponse(new URL('https://apiv3.fansly.com/api/v1/timelinenew/12'), '12')
    ).toBe(true)
    expect(
      fanslyAdapter.feedResponse(
        new URL('https://apiv3.fansly.com/api/v1/mediaoffers/location?accountId=12'),
        '12'
      )
    ).toBe(true)
    expect(
      fanslyAdapter.feedResponse(
        new URL('https://apiv3.fansly.com/api/v1/message?accountId=12'),
        '12'
      )
    ).toBe(false)
    expect(
      fanslyAdapter.ownerId({ response: [{ username: 'example', id: '12' }] }, 'example')
    ).toBe('12')
  })
  it('associates posts and bundle members and does not download locked previews', () => {
    const items = fanslyItems({
      response: {
        posts: [{ id: '100', attachments: [{ contentId: '1' }, { contentId: '9' }] }],
        accountMediaBundles: [{ id: '9', content: [{ accountMediaId: '2' }] }],
        accountMedia: [media('1'), media('2', false), media('3')]
      }
    })
    expect(items.map((x) => x.item)).toEqual([
      { id: '1', postId: '100', category: 'photos', state: 'available', downloaded: false },
      { id: '2', postId: '100', category: 'photos', state: 'locked', downloaded: false }
    ])
    expect(items[1].mediaUrl).toBeNull()
  })
  it('reads the media tab aggregation and keeps an incomplete scan partial', () => {
    const payload = {
      response: {
        data: [{ mediaOfferId: '1', locationId: '999', correlationId: '100' }],
        aggregationData: { accountMedia: [media('1')] }
      }
    }
    expect(fanslyItems(payload)[0].item.postId).toBe('100')
    expect(fanslyAdapter.complete(payload)).toBe(false)
    expect(fanslyAdapter.complete({ response: { data: [] } })).toBe(true)
    expect(fanslyAdapter.complete({ response: {} })).toBe(false)
  })
  it('does not turn video thumbnails into downloadable videos', () => {
    const result = fanslyItems({
      response: {
        posts: [{ id: '100', attachments: [{ contentId: '1' }] }],
        accountMedia: [
          {
            id: '1',
            access: true,
            media: {
              mimetype: 'video/mp4',
              locations: [],
              variants: [
                {
                  mimetype: 'image/jpeg',
                  locations: [{ location: 'https://cdn3.fansly.com/thumb.jpg' }]
                }
              ]
            }
          }
        ]
      }
    })
    expect(result[0].item.state).toBe('unsupported')
    expect(result[0].mediaUrl).toBeNull()
  })
  it('maps every member of real bundleContent and ignores the timeline locationId', () => {
    const result = fanslyItems({
      response: {
        data: [
          { mediaOfferId: '1', mediaOfferBundleId: '9', locationId: '999', correlationId: '100' }
        ],
        aggregationData: {
          accountMediaBundles: [
            {
              id: '9',
              accountMediaIds: ['1', '2'],
              bundleContent: [{ accountMediaId: '1' }, { accountMediaId: '2' }]
            }
          ],
          accountMedia: [media('1'), media('2')]
        }
      }
    })
    expect(result.map((entry) => entry.item.postId)).toEqual(['100', '100'])
  })
  it('rejects third party locations and preserves the signed first party URL', () => {
    expect(fanslyMediaUrl('https://cdn.fansly.com/media/1.jpg?Signature=secret')).toContain(
      'Signature=secret'
    )
    for (const url of [
      'https://fansly.com.evil.test/1.jpg',
      'https://apiv3.fansly.com/1.jpg',
      'http://cdn.fansly.com/1.jpg',
      'https://secret@cdn.fansly.com/1.jpg'
    ]) {
      expect(fanslyMediaUrl(url)).toBeNull()
    }
  })
})
