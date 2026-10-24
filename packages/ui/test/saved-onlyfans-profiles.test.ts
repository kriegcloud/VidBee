import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { OnlyFansProfile } from '@vidbee/downloader-core/onlyfans-profile'
import { savedOnlyFansProfiles } from '../src/lib/saved-onlyfans-profiles'

const media = (id: string): OnlyFansProfile['items'][number] => ({
  id,
  postId: id,
  category: 'photos',
  state: 'available',
  downloaded: false
})

test('linked creator posts and chat appear as one saved profile', () => {
  const creator: OnlyFansProfile = {
    username: 'babee.vip',
    profileUrl: 'https://onlyfans.com/babee.vip',
    linkedChatId: '160988745',
    state: 'complete',
    updatedAt: 1,
    pages: 1,
    items: [media('1')]
  }
  const chat: OnlyFansProfile = {
    username: '160988745',
    profileUrl: 'https://onlyfans.com/my/chats/chat/160988745',
    chatId: '160988745',
    creatorUsername: 'babee.vip',
    state: 'mapping',
    updatedAt: 2,
    pages: 2,
    items: [media('1'), media('2')]
  }
  const saved = savedOnlyFansProfiles([chat, creator], (id) => `Chat ${id}`)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].profile.username, 'babee.vip')
  assert.equal(saved[0].profile.profileUrl, creator.profileUrl)
  assert.equal(saved[0].totalAssetCount, 2)
  assert.deepEqual(saved[0].mapping, { state: 'running' })

  const gallery: OnlyFansProfile = {
    ...chat,
    chatRoute: 'gallery',
    profileUrl: `${chat.profileUrl}/gallery`,
    creatorUsername: undefined,
    items: [media('3')]
  }
  const withLegacyRoute = savedOnlyFansProfiles([gallery, chat, creator], (id) => `Chat ${id}`)
  assert.equal(withLegacyRoute.length, 1)
  assert.equal(withLegacyRoute[0].totalAssetCount, 3)
})

test('unlinked legacy chat remains selectable by its own URL', () => {
  const chat: OnlyFansProfile = {
    username: '7',
    profileUrl: 'https://onlyfans.com/my/chats/chat/7',
    chatId: '7',
    state: 'complete',
    updatedAt: 1,
    pages: 1,
    items: []
  }
  const saved = savedOnlyFansProfiles([chat], (id) => `Chat ${id}`)
  assert.equal(saved[0].profile.username, 'Chat 7')
  assert.equal(saved[0].profile.profileUrl, chat.profileUrl)
})
