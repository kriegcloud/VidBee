import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  indexOnlyFansChatOwners,
  indexSavedSocialProfileGroups,
  resolveCreatorProfileGroup
} from '../src/lib/saved-social-profile-groups'

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

test('OnlyFans and Fansly media resolve to one group per creator', () => {
  const post = resolveCreatorProfileGroup({
    url: 'https://onlyfans.com/2214255537/syd.babee',
    title: '@syd.babee · photos · 2214255537'
  })
  assert.deepEqual(post, {
    id: 'creator-profile:onlyfans:syd.babee',
    title: '@syd.babee'
  })
  assert.deepEqual(
    resolveCreatorProfileGroup({ url: 'https://onlyfans.com/2215175806/Syd.Babee' })?.id,
    post?.id
  )
  const chatOwners = indexOnlyFansChatOwners([
    {
      username: '160988745',
      profileUrl: 'https://onlyfans.com/my/chats/chat/160988745',
      chatId: '160988745',
      creatorUsername: 'babee.vip',
      state: 'complete',
      updatedAt: 1,
      pages: 1,
      items: []
    }
  ])
  assert.deepEqual(
    resolveCreatorProfileGroup(
      {
        url: 'https://onlyfans.com/my/chats/chat/160988745?firstId=7',
        title: '@160988745 · photos · 7'
      },
      chatOwners
    ),
    { id: 'creator-profile:onlyfans:babee.vip', title: '@babee.vip' }
  )
  assert.deepEqual(resolveCreatorProfileGroup({ url: 'https://onlyfans.com/7/babee.vip' }), {
    id: 'creator-profile:onlyfans:babee.vip',
    title: '@babee.vip'
  })
  assert.deepEqual(
    resolveCreatorProfileGroup({
      url: 'https://onlyfans.com/my/chats/chat/160988745?firstId=7',
      title: '@160988745 · photos · 7'
    }),
    { id: 'creator-profile:onlyfans:chat:160988745', title: '@160988745' }
  )
  assert.deepEqual(resolveCreatorProfileGroup({ url: 'https://fansly.com/creator/posts' }), {
    id: 'creator-profile:fansly:creator',
    title: '@creator'
  })
  assert.equal(resolveCreatorProfileGroup({ url: 'https://onlyfans.com/' }), null)
  assert.equal(resolveCreatorProfileGroup({ url: 'https://example.com/creator/posts' }), null)
})
