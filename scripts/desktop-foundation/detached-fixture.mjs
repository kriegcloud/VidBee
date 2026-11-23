import assert from 'node:assert/strict'
import vm from 'node:vm'
import { sourceLoader } from './source-harness.mjs'
const calls = []
const module = new vm.SyntheticModule(['startIdleMinimalModelFill', 'flushDeferredAutoTranscriptions'], function () {
  this.setExport('startIdleMinimalModelFill', () => calls.push('idle'))
  this.setExport('flushDeferredAutoTranscriptions', () => calls.push('flush'))
})
await module.link(() => {})
await module.evaluate()
const load = sourceLoader({
  $import: async (specifier) => { assert.equal(specifier, './transcript-host'); calls.push('import'); return module },
  electron: { BrowserWindow: { getAllWindows: () => [{ webContents: { send: () => calls.push('broadcast') } }] } },
  '../settings': { settingsManager: { setAll: () => calls.push('write'),
    getAll: () => { calls.push('read'); return { transcriptionProvider: 'local' } } } },
  '../utils/auto-launch': {}, '../utils/dock': {}, './app-icon-menu': {}, './task-queue-host': {}
})
load('apps/desktop/src/main/lib/settings-host.ts').updateDesktopSettings({ transcriptionProvider: 'local' })
assert(calls.includes('broadcast'))
assert.equal(calls.includes('idle'), false)
for (let turn = 0; turn < 20; turn++) await Promise.resolve()
assert.deepEqual(calls, ['write', 'read', 'import', 'broadcast', 'idle', 'flush'])
