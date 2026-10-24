import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDownloadListModel } from '../src/renderer/src/lib/download-list-rows'
import type { DownloadRecord } from '../src/renderer/src/store/downloads'

const record = (id: string, fields: Partial<DownloadRecord> = {}): DownloadRecord =>
  ({
    id,
    entryType: 'history',
    url: `https://example.com/${id}`,
    title: id,
    type: 'video',
    status: 'completed',
    createdAt: 1,
    ...fields
  }) as DownloadRecord

test('virtual history retains saved-profile grouping and locates collapsed members', () => {
  const records = [record('first'), record('second')]
  const savedProfileGroups = new Map(
    records.map((item) => [
      item.url,
      {
        id: 'saved-profile',
        title: '@creator'
      }
    ])
  )
  const model = buildDownloadListModel({
    records,
    filtered: records,
    contexts: [],
    savedProfileGroups,
    isExpanded: () => false
  })
  assert.equal(model.rows.length, 1)
  const header = model.rows[0]
  assert.equal(header.kind, 'playlist')
  if (header.kind !== 'playlist') {
    throw new Error('Expected profile header')
  }
  assert.equal(header.title, '@creator')
  assert.equal(header.isPlaylist, false)
  assert.equal(header.totalCount, 2)
  assert.equal(model.locations.get('second')?.groupId, 'saved-profile')
  assert.equal(model.rowIndexById.has('second'), false)
})

test('virtual history preserves batch order and distinguishes playlists from social batches', () => {
  const records = [
    record('later', { batchId: 'batch', batchTitle: '@creator', batchOrder: 1 }),
    record('earlier', { batchId: 'batch', batchTitle: '@creator', batchOrder: 0 }),
    record('playlist', { playlistId: 'playlist', playlistTitle: 'Playlist', playlistSize: 3 })
  ]
  const model = buildDownloadListModel({
    records,
    filtered: records,
    contexts: [],
    isExpanded: () => true
  })
  assert.deepEqual(
    model.rows.filter((row) => row.kind === 'task').map((row) => row.record.id),
    ['earlier', 'later', 'playlist']
  )
  assert.deepEqual(
    model.rows
      .filter((row) => row.kind === 'playlist')
      .map((row) => ({
        title: row.title,
        isPlaylist: row.isPlaylist,
        total: row.totalCount
      })),
    [
      { title: '@creator', isPlaylist: false, total: 2 },
      { title: 'Playlist', isPlaylist: true, total: 3 }
    ]
  )
})

test('OnlyFans and Fansly media collapse under one profile header with its site label', () => {
  const records = [
    record('of-1', {
      url: 'https://onlyfans.com/2214255537/syd.babee',
      title: '@syd.babee · photos · 2214255537'
    }),
    record('of-2', {
      url: 'https://onlyfans.com/2215175806/syd.babee',
      title: '@syd.babee · photos · 2215175806'
    }),
    record('of-chat', {
      url: 'https://onlyfans.com/my/chats/chat/160988745?firstId=7',
      title: '@160988745 · photos · 7'
    }),
    record('fansly-1', { url: 'https://fansly.com/creator/posts', title: '@creator · photos · 1' })
  ]
  const model = buildDownloadListModel({
    records,
    filtered: records,
    contexts: [],
    isExpanded: () => false
  })
  assert.deepEqual(
    model.rows.map((row) => (row.kind === 'playlist' ? [row.title, row.platformLabel] : row.key)),
    [
      ['@syd.babee', 'OnlyFans'],
      ['@160988745', 'OnlyFans'],
      ['@creator', 'Fansly']
    ]
  )
  assert.equal(model.locations.get('of-2')?.groupId, 'creator-profile:onlyfans:syd.babee')
})
