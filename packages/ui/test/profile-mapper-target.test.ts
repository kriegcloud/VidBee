import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveProfileMapperTarget } from '../src/lib/profile-mapper-target'

test('any post row can name the profile its mapper should open', () => {
  assert.deepEqual(
    resolveProfileMapperTarget('https://www.tiktok.com/@syddbabee/video/7641803632509259021'),
    { profileUrl: 'https://www.tiktok.com/@syddbabee', siteLabel: 'TikTok' }
  )
  assert.deepEqual(resolveProfileMapperTarget('https://x.com/sydthebabee/status/1234567890'), {
    profileUrl: 'https://x.com/sydthebabee',
    siteLabel: 'X'
  })
  assert.deepEqual(resolveProfileMapperTarget('https://onlyfans.com/2214255537/syd.babee'), {
    profileUrl: 'https://onlyfans.com/syd.babee',
    siteLabel: 'OnlyFans'
  })
  // A profile URL maps to itself, so gallery rows keep the entry too.
  assert.deepEqual(resolveProfileMapperTarget('https://www.tiktok.com/@syddbabee'), {
    profileUrl: 'https://www.tiktok.com/@syddbabee',
    siteLabel: 'TikTok'
  })
})

test('VSCO and Threads rows reach the gallery and media tab their mapper traverses', () => {
  for (const row of [
    'https://vsco.co/allybari/media/65a1b2c3d4e5f6',
    'https://vsco.co/allybari/video/aa11bb22-cc33',
    'https://vsco.co/allybari/gallery',
    'https://vsco.co/allybari'
  ]) {
    assert.deepEqual(resolveProfileMapperTarget(row), {
      profileUrl: 'https://vsco.co/allybari/gallery',
      siteLabel: 'VSCO'
    })
  }
  for (const row of [
    'https://www.threads.com/@benoppold/post/DAbCdEf',
    'https://www.threads.com/@benoppold/media',
    'https://threads.net/@benoppold'
  ]) {
    assert.deepEqual(resolveProfileMapperTarget(row), {
      profileUrl: 'https://www.threads.com/@benoppold/media',
      siteLabel: 'Threads'
    })
  }
})

test('URLs that cannot name an owner get no mapper entry', () => {
  assert.equal(resolveProfileMapperTarget(undefined), null)
  assert.equal(resolveProfileMapperTarget('not a url'), null)
  assert.equal(resolveProfileMapperTarget('https://www.redgifs.com/watch/example'), null)
  assert.equal(resolveProfileMapperTarget('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), null)
})
