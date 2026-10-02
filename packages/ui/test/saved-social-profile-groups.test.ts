import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexSavedSocialProfileGroups } from '../src/lib/saved-social-profile-groups'

test('saved TikTok and Redgifs posts nest under their profile even without a shared task batch', () => {
  const groups = indexSavedSocialProfileGroups([
    {
      platform: 'tiktok',
      owner: 'medusa.san',
      categories: {
        videos: { items: [{ url: 'https://www.tiktok.com/@medusa.san/video/123' }] },
        photos: { items: [{ url: 'https://www.tiktok.com/@medusa.san/photo/456' }] }
      }
    },
    {
      platform: 'redgifs',
      owner: 'medusa4prsdnt',
      categories: { posts: { items: [{ url: 'https://www.redgifs.com/watch/example' }] } }
    }
  ])

  assert.deepEqual(groups.get('https://www.tiktok.com/@medusa.san/video/123'), {
    id: 'saved-social-profile:tiktok:medusa.san',
    title: '@medusa.san'
  })
  assert.equal(
    groups.get('https://www.tiktok.com/@medusa.san/photo/456'),
    groups.get('https://www.tiktok.com/@medusa.san/video/123')
  )
  assert.deepEqual(groups.get('https://www.redgifs.com/watch/example'), {
    id: 'saved-social-profile:redgifs:medusa4prsdnt',
    title: '@medusa4prsdnt'
  })
})
