import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveDownloadWorkflow, resolveProfileMappingSources } from '../src/lib/download-workflow'

test('every chat source stays in the dedicated browser profile workflow', () => {
  for (const path of [
    '',
    '/gallery',
    '/gallery/opened',
    '/gallery/purchased',
    '/gallery/photos',
    '/gallery/videos'
  ]) {
    assert.deepEqual(
      resolveDownloadWorkflow(`https://onlyfans.com/my/chats/chat/172650280${path}`),
      {
        provider: 'onlyfans',
        surface: 'browser-profile',
        access: 'dedicated-browser'
      }
    )
  }
})

test('profile and general downloader routes retain their own workflow', () => {
  assert.equal(
    resolveDownloadWorkflow('https://fansly.com/example/posts').surface,
    'browser-profile'
  )
  assert.equal(resolveDownloadWorkflow('https://instagram.com/example/').surface, 'native-profile')
  assert.equal(resolveDownloadWorkflow('https://youtube.com/@example/videos').surface, 'playlist')
  assert.equal(resolveDownloadWorkflow('https://youtube.com/watch?v=example').surface, 'single')
})

test('the chat and Fansly dialogs expose their site-specific source routes', () => {
  const chat = resolveProfileMappingSources(
    'https://onlyfans.com/my/chats/chat/172650280/gallery/opened'
  )
  assert.equal(chat.selectedKey, 'opened')
  assert.deepEqual(
    chat.options.map((option) => option.key),
    ['messages', 'gallery', 'opened', 'purchased', 'photos', 'videos']
  )
  assert.equal(chat.options.find((option) => option.key === 'opened')?.category, 'media')
  assert.equal(
    chat.options.find((option) => option.key === 'purchased')?.url,
    'https://onlyfans.com/my/chats/chat/172650280/gallery/purchased'
  )

  const fansly = resolveProfileMappingSources('https://fansly.com/example/posts')
  assert.equal(fansly.selectedKey, 'posts')
  assert.deepEqual(
    fansly.options.map((option) => option.category),
    ['posts', 'media']
  )
})
