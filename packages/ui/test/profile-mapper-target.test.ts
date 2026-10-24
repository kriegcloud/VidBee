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

test('URLs that cannot name an owner get no mapper entry', () => {
  assert.equal(resolveProfileMapperTarget(undefined), null)
  assert.equal(resolveProfileMapperTarget('not a url'), null)
  assert.equal(resolveProfileMapperTarget('https://www.redgifs.com/watch/example'), null)
  assert.equal(resolveProfileMapperTarget('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), null)
})
