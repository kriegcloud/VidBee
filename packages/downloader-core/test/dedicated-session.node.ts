import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEDICATED_SESSION_PLATFORMS,
  isDedicatedSessionPlatform,
  MAPPED_PROFILE_SITE_LABELS
} from '../src/mapped-profile-source'

test('only X and TikTok sign in through a dedicated browser session', () => {
  assert.deepEqual([...DEDICATED_SESSION_PLATFORMS], ['x', 'tiktok'])
  for (const platform of ['x', 'tiktok']) {
    assert.equal(isDedicatedSessionPlatform(platform), true, platform)
  }
  // Threads was once offered a login window the desktop then refused.
  for (const platform of [
    'threads',
    'vsco',
    'pinterest',
    'facebook',
    'redgifs',
    '',
    null,
    undefined
  ]) {
    assert.equal(isDedicatedSessionPlatform(platform), false, String(platform))
  }
})

test('every dedicated-session platform is a labelled mapped-profile platform', () => {
  for (const platform of DEDICATED_SESSION_PLATFORMS) {
    assert.ok(MAPPED_PROFILE_SITE_LABELS[platform])
  }
})
