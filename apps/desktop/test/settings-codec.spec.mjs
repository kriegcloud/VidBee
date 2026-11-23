// Source-acquisition oracle: exercise the installed store and actual manager without a live profile.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { it } from '@effect/vitest'
import * as RS from 'effect/rpc/RpcSerialization'
import * as S from 'effect/Schema'
import { settingsHarness } from '../../../scripts/desktop-foundation/source-harness.mjs'
import { SettingsWriteError } from '../src/shared/Settings.errors.ts'
import { projectSettings, SettingsPatch } from '../src/shared/Settings.model.ts'
import { SettingsRpcs } from '../src/shared/Settings.rpc.ts'
import { defaultSettings } from '../src/shared/types/index.ts'

const roundTrip = (schema, value) => {
  const codec = RS.json.codecFor(schema)
  const parser = RS.json.makeUnsafe()
  const encoded = S.encodeSync(codec)(value)
  const [frame] = parser.decode(parser.encode({ value: encoded }))
  return S.decodeSync(codec)(frame.value)
}

it('actual manager repairs precede tolerant projection; unrelated saves never persist fallback values', () => {
  const parent = path.resolve('.cache/services-oracles')
  fs.mkdirSync(parent, { recursive: true })
  const directory = fs.mkdtempSync(path.join(parent, 'settings-'))
  try {
    fs.writeFileSync(
      path.join(directory, 'config.json'),
      JSON.stringify({
        maxConcurrentDownloads: 'malformed',
        theme: null,
        asrTier: 'not-a-model',
        downloadPath: '/synthetic/external',
        extensionCookieSources: [{ future: { enabled: true }, browser: 'chrome', id: 'p' }],
        future: { nested: ['retained'] }
      })
    )
    const harness = settingsHarness(directory)
    const defaults = { ...defaultSettings, downloadPath: '/synthetic/home/Downloads/VidBee' }
    const before = fs.readFileSync(path.join(directory, 'config.json'), 'utf8')
    const result = projectSettings({ document: harness.manager.getAll(), defaults })
    assert.equal(result._tag, 'Success')
    const view = result.success.settings
    assert.deepEqual(result.success.invalidKeys, ['maxConcurrentDownloads', 'theme'])
    assert.equal(view.maxConcurrentDownloads, 5)
    assert.equal(view.theme, 'system')
    assert.equal(view.asrTier, 'minimal')
    assert.deepEqual(Object.keys(view.extensionCookieSources[0]), ['future', 'browser', 'id'])
    assert.equal(fs.readFileSync(path.join(directory, 'config.json'), 'utf8'), before)
    const rpc = SettingsRpcs.requests.get('Settings.GetAll')
    const completion = { exit: { _tag: 'Success', value: view }, cuts: [] }
    assert.deepEqual(roundTrip(rpc.successSchema, completion), completion)
    harness.manager.set('closeToTray', false)
    harness.manager.setAll({ launchAtLogin: false, hideDockIcon: true, language: 'en' })
    const raw = harness.raw()
    assert.equal(raw.maxConcurrentDownloads, 'malformed')
    assert.equal(raw.theme, null)
    assert.deepEqual(raw.future, { nested: ['retained'] })
    assert.deepEqual(raw.extensionCookieSources[0].future, { enabled: true })
    assert.equal(raw.closeToTray, false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it('complete Settings declaration codecs preserve ordered writes, original messages, cuts and own undefined', () => {
  const token = { document: 'd', client: 'c', generation: 1, family: 'settings', serial: 1 }
  const cut = { token, epoch: 'e', through: 2 }
  const document = { ...defaultSettings, future: { own: undefined, n: -0, big: 1n } }
  const getAll = SettingsRpcs.requests.get('Settings.GetAll')
  assert.deepEqual(roundTrip(getAll.payloadSchema, { settings: token }), { settings: token })
  const success = { exit: { _tag: 'Success', value: document }, cuts: [cut] }
  const observed = roundTrip(getAll.successSchema, success)
  assert.deepEqual(observed, success)
  assert.deepEqual(Object.keys(observed.exit.value.future), ['own', 'n', 'big'])
  const patch = [
    { key: 'launchAtLogin', value: false },
    { key: 'hideDockIcon', value: true },
    { key: 'language', value: 'en' },
    {
      key: 'extensionCookieSources',
      value: [{ id: 'p', browser: 'chrome', future: { own: undefined, n: -0, big: 1n } }]
    }
  ]
  const setAll = SettingsRpcs.requests.get('Settings.SetAll')
  const outgoing = roundTrip(setAll.payloadSchema, { settings: patch })
  assert.deepEqual(outgoing, { settings: patch })
  assert.deepEqual(Object.keys(outgoing.settings[3].value[0].future), ['own', 'n', 'big'])
  assert.throws(() => roundTrip(SettingsPatch, [...patch, patch[0]]))
  const completed = { exit: { _tag: 'Success', value: undefined }, cuts: [cut] }
  assert.deepEqual(roundTrip(setAll.successSchema, completed), completed)
  const error = SettingsWriteError.make({
    operation: 'setAll',
    key: 'hideDockIcon',
    message: 'read only'
  })
  const failed = { exit: { _tag: 'Failure', error }, cuts: [cut] }
  assert.deepEqual(roundTrip(setAll.successSchema, failed), failed)
})
