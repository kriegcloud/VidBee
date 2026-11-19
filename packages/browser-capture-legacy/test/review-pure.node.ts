import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as cookies from '../src/cookies'
import * as drm from '../src/drm'
import * as quality from '../src/quality'
import * as protocol from '../src/protocol'
import * as recorder from '../src/recorder'
import * as player from '../src/player'
import * as onlyfans_profile from '../src/onlyfans-profile'
import * as fansly_profile from '../src/fansly-profile'
import { call, pack, unpack } from './fixtures/pure-oracle-cases.mjs'

// Results were recorded from the unchanged git-archive main package with pinned Node.
// Old engine failures for calls outside declared types require failure only.
const entries = unpack(JSON.parse(readFileSync(new URL('./fixtures/pure-oracle.json', import.meta.url), 'utf8')))
const modules = { cookies, drm, quality, protocol, recorder, player, onlyfans_profile, fansly_profile }
test('pure oracle: complete values, deliberate errors and argument mutation', { timeout: 120000 }, () => {
  const clock = Date.now
  Date.now = () => 1800000000000
  try {
    assert.equal(entries.length, 6513)
    for (const entry of entries) {
      const actual = call(modules, entry)
      if (entry.expected.engine) {
        assert.ok('error' in actual, `${entry.module}.${entry.name} must fail`)
        assert.deepEqual(pack(actual.postArgs), pack(entry.expected.postArgs), `${entry.module}.${entry.name} failed-call mutation`)
      }
      else assert.deepEqual(pack(actual), pack(entry.expected), `${entry.module}.${entry.name}(${JSON.stringify(pack(entry.args))})`)
    }
  } finally { Date.now = clock }
})
