import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createStore } from 'jotai'
import { sourceLoader } from './source-harness.mjs'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function renderer() {
  const requests = []
  const errors = []
  let load = async () => ({ theme: 'dark', language: 'ja' })
  let changeLanguage = async () => {}
  const source = sourceLoader({ '../lib/ipc': { ipcServices: { settings: {
    getAll: () => load(), set: (...args) => { const d = deferred(); requests.push({ ...d, args }); return d.promise },
    setAll: (...args) => { const d = deferred(); requests.push({ ...d, args }); return d.promise }
  } } }, '../i18n': { __esModule: true, default: { language: 'en', changeLanguage: (value) => changeLanguage(value) } },
  '../lib/logger': { logger: { error: (message) => errors.push(message) } } })
  return { atoms: source('apps/desktop/src/renderer/src/store/settings.ts'), store: createStore(), requests, errors,
    failLoad: () => { load = async () => { throw new Error('load') } },
    failLanguage: () => { changeLanguage = async () => { throw new Error('language') } } }
}

test('renderer provisional state, load failure and language failure', async () => {
  const h = renderer(), { atoms: a, store: s } = h
  assert.equal(s.get(a.settingsLoadedAtom), false)
  assert.equal(s.get(a.settingsAtom).downloadPath, '')
  h.failLanguage()
  await s.set(a.loadSettingsAtom)
  assert.equal(s.get(a.settingsLoadedAtom), true)
  assert.equal(s.get(a.settingsAtom).language, 'ja')
  assert.deepEqual(h.errors, ['Failed to apply saved language:'])
  const failed = renderer(); failed.failLoad()
  await failed.store.set(failed.atoms.loadSettingsAtom)
  assert.equal(failed.store.get(failed.atoms.settingsLoadedAtom), false)
})

test('overlapping optimistic save failure restores the stale entire object and resolves', async () => {
  const { atoms: a, store: s, requests, errors } = renderer()
  const before = s.get(a.settingsAtom)
  const first = s.set(a.saveSettingAtom, { key: 'theme', value: 'dark' })
  assert.equal(s.get(a.settingsAtom).theme, 'dark')
  const second = s.set(a.saveSettingAtom, { key: 'language', value: 'ja' })
  requests[1].resolve(); await second
  assert.equal(s.get(a.settingsAtom).language, 'ja')
  requests[0].reject(new Error('persistence')); await first
  assert.equal(s.get(a.settingsAtom), before)
  assert.deepEqual(errors, ['Failed to save setting:'])
})

test('batch saves merge only after success, preserve newer keys, swallow failure', async () => {
  const { atoms: a, store: s, requests } = renderer()
  const before = s.get(a.settingsAtom)
  const batch = s.set(a.saveAllSettingsAtom, { theme: 'dark' })
  assert.equal(s.get(a.settingsAtom), before)
  s.set(a.settingsAtom, { ...before, language: 'ja' })
  requests[0].resolve(); await batch
  assert.equal(s.get(a.settingsAtom).theme, 'dark')
  assert.equal(s.get(a.settingsAtom).language, 'ja')
  const failed = s.set(a.saveAllSettingsAtom, { language: 'fr' })
  requests[1].reject(new Error('batch')); await failed
  assert.equal(s.get(a.settingsAtom).language, 'ja')
})

test('settings host writes/rereads/effects/broadcast order and later failure', () => {
  const calls = []
  let fail = false
  const actual = { launchAtLogin: true, hideDockIcon: false, language: 'ja' }
  const load = sourceLoader({
    electron: { BrowserWindow: { getAllWindows: () => [{ webContents: { send: (channel) => calls.push(channel) } }] } },
    '../settings': { settingsManager: { setAll: (patch) => {
      for (const key of Object.keys(patch)) { calls.push(`write:${key}`); if (fail && key === 'hideDockIcon') throw new Error('write') }
    }, getAll: () => { calls.push('reread'); return actual } } },
    '../utils/auto-launch': { applyAutoLaunchSetting: (v) => calls.push(`login:${v}`) },
    '../utils/dock': { applyDockVisibility: (v) => calls.push(`dock:${v}`) },
    './app-icon-menu': { refreshAppIconMenus: () => calls.push('language') },
    './task-queue-host': { applyDesktopQueueConcurrency: () => calls.push('queue') }
  })
  const { updateDesktopSettings: update } = load('apps/desktop/src/main/lib/settings-host.ts')
  update({ launchAtLogin: false, hideDockIcon: true, language: 'fr' })
  assert.deepEqual(calls, ['write:launchAtLogin', 'write:hideDockIcon', 'write:language', 'reread',
    'login:true', 'dock:false', 'language', 'settings:changed'])
  calls.length = 0; fail = true
  assert.throws(() => update({ launchAtLogin: true, hideDockIcon: true, language: 'ja' }))
  assert.deepEqual(calls, ['write:launchAtLogin', 'write:hideDockIcon'])
  calls.length = 0; update({})
  assert.deepEqual(calls, ['reread', 'settings:changed'])
})

test('preload exposes only helpers and cleanup requires returned wrapper', () => {
  const exposed = {}, listeners = [], sent = []
  const ipcRenderer = { on: (channel, fn) => listeners.push([channel, fn]),
    removeListener: (channel, fn) => { const i = listeners.findIndex(([c, f]) => c === channel && f === fn); if (i >= 0) listeners.splice(i, 1) },
    send: (...args) => sent.push(args), invoke: async () => 'invoked' }
  sourceLoader({ $process: { contextIsolated: true }, '@better-auth/electron/preload': { setupRenderer: () => {} },
    '@electron-toolkit/preload': { electronAPI: { ipcRenderer } },
    '@vidbee/logger/legacy/client': { logger: { error() {} } },
    electron: { contextBridge: { exposeInMainWorld: (key, value) => { exposed[key] = value } }, ipcRenderer,
      webUtils: { getPathForFile: (file) => { if (file.fail) throw new Error('file'); return file.path } } }
  })('apps/desktop/src/preload/index.ts')
  const api = exposed.api
  assert.deepEqual(Object.keys(api), ['on', 'removeListener', 'send', 'getPathForFile'])
  assert.equal(api.settings, undefined)
  const received = []
  const callback = (...args) => received.push(args)
  const wrapper = api.on('fixture', callback)
  listeners[0][1]({ native: true }, 'value', 7)
  api.removeListener('fixture', callback)
  assert.equal(listeners.length, 1)
  api.removeListener('fixture', wrapper)
  assert.equal(listeners.length, 0)
  assert.deepEqual(received, [['value', 7]])
  api.send('fixture', 1, 'two')
  assert.deepEqual(sent, [['fixture', 1, 'two']])
  assert.equal(api.getPathForFile({ path: ' /fixture/file ' }), ' /fixture/file ')
  assert.equal(api.getPathForFile({ path: '  ' }), null)
  assert.equal(api.getPathForFile({ fail: true }), null)
})

test('native dialog uses focused/no-focus overload and stays pending independently of context', async () => {
  const pending = deferred(), calls = []
  let focused = { id: 'focused' }
  const load = sourceLoader({
    electron: { app: {}, BrowserWindow: { getFocusedWindow: () => focused },
      dialog: { showMessageBox: (...args) => { calls.push(args); return pending.promise } } },
    'electron-ipc-decorator': { IpcService: class {}, IpcMethod: () => () => {} },
    '../../lib/ffmpeg-manager': {}, '../../lib/ytdlp-kernel-host': {}, '../../lib/ytdlp-manager': {},
    '../../utils/logger': {} })
  const { AppService } = load('apps/desktop/src/main/ipc/services/app-service.ts')
  const service = new AppService(), options = { message: 'fixture' }
  const context = { sender: { id: 'caller' } }
  let settled = false
  const first = service.showMessageBox(context, options).then((v) => { settled = true; return v })
  assert.equal(calls[0][0], focused)
  assert.equal(calls[0][1], options)
  context.sender = null
  await Promise.resolve(); assert.equal(settled, false)
  focused = null
  const second = service.showMessageBox({}, options)
  assert.deepEqual(calls[1], [options])
  const result = { response: 1, checkboxChecked: false }
  pending.resolve(result)
  assert.equal(await first, result); assert.equal(await second, result)
})

test('window operations use focused window, toggle, and no-focus no-op/false', () => {
  const calls = []
  let focused = null, maximized = false
  const load = sourceLoader({ electron: { BrowserWindow: { getFocusedWindow: () => focused } },
    'electron-ipc-decorator': { IpcService: class {}, IpcMethod: () => () => {} },
    '../../lib/share-capture-window': {} })
  const { WindowService } = load('apps/desktop/src/main/ipc/services/window-service.ts')
  const service = new WindowService()
  for (const method of ['minimize', 'maximize', 'close']) service[method]({ sender: 'caller' })
  assert.equal(service.isMaximized({}), false)
  focused = { minimize: () => calls.push('minimize'), close: () => calls.push('close'),
    isMaximized: () => maximized, maximize: () => { maximized = true; calls.push('maximize') },
    unmaximize: () => { maximized = false; calls.push('unmaximize') } }
  service.maximize({ sender: 'other' }); assert.equal(service.isMaximized({}), true)
  service.maximize({}); service.minimize({}); service.close({})
  assert.deepEqual(calls, ['maximize', 'unmaximize', 'minimize', 'close'])
})

test('reset reapplies dock/login/queue and does not broadcast', () => {
  const calls = []
  const load = sourceLoader({ 'electron-ipc-decorator': { IpcService: class {}, IpcMethod: () => () => {} },
    '../../lib/settings-host': { updateDesktopSettings: () => calls.push('update') },
    '../../lib/task-queue-host': { applyDesktopQueueConcurrency: () => calls.push('queue') },
    '../../settings': { settingsManager: { reset: () => calls.push('reset'), get: (k) => k } },
    '../../utils/auto-launch': { applyAutoLaunchSetting: (v) => calls.push(v) },
    '../../utils/dock': { applyDockVisibility: (v) => calls.push(v) } })
  const { SettingsService } = load('apps/desktop/src/main/ipc/services/settings-service.ts')
  new SettingsService().reset({})
  assert.deepEqual(calls, ['reset', 'hideDockIcon', 'launchAtLogin', 'queue'])
})

test('boot imports and logger setup precede second-instance rejection and readiness', () => {
  const calls = []
  const stop = new Error('owned exit')
  const noop = () => {}
  const app = { isPackaged: true, getPath: () => '/synthetic/profile', setPath: noop, setName: noop,
    commandLine: { appendSwitch: noop }, on: noop, requestSingleInstanceLock: () => { calls.push('lock'); return false },
    exit: (code) => { calls.push(`exit:${code}`); throw stop }, whenReady: () => { calls.push('ready'); return new Promise(() => {}) } }
  const load = sourceLoader({ $process: { argv: ['fixture', '--background'], env: {}, platform: 'linux', on: noop },
    electron: { app, BrowserWindow: {}, ipcMain: { on: noop }, protocol: { registerSchemesAsPrivileged: noop } },
    './logging/ElectronLog.driver': { electronLog: { initialize: () => calls.push('logger'), info: noop, error: noop } },
    './lib/auth-client': { setupDesktopAuth: noop },
    './lib/ipc-coalescer': { createKeyedCoalescer: () => ({}) },
    './lib/subscriptions-host': { getDesktopSubscriptions: () => ({ on: noop }) },
    './config/logger-config': { configureLogger: () => calls.push('configure') },
    './lib/privileged-schemes': { installPrivilegedSchemeCollector: () => noop },
    $require: (id) => {
      if (id.startsWith('node:')) return undefined
      calls.push(`import:${id}`)
      return {}
    } })
  assert.throws(() => load('apps/desktop/src/main/index.ts'), (error) => error === stop)
  assert(calls.includes('import:./settings'))
  assert(calls.includes('import:./ipc'))
  assert(calls.indexOf('import:./settings') < calls.indexOf('lock'))
  assert(calls.indexOf('import:./ipc') < calls.indexOf('lock'))
  assert(calls.indexOf('logger') < calls.indexOf('configure'))
  assert(calls.indexOf('configure') < calls.indexOf('lock'))
  assert.equal(calls.at(-1), 'exit:0')
  assert.equal(calls.includes('ready'), false)
})

test('share queue starts in enqueue order through success/rejection and retains waiting closures', async () => {
  const starts = [], windows = []
  let ready
  class Window {
    destroyed = false
    webContents = { isDestroyed: () => false, setBackgroundThrottling() {},
      send: (_channel, message) => { starts.push(message.payload.source); this.message = message } }
    loadURL = async () => { ready({ sender: this.webContents }, { requestId: 0 }) }
    on() {}
    destroy() { this.destroyed = true }
    isDestroyed() { return this.destroyed }
    constructor() { windows.push(this) }
  }
  const deps = { BrowserWindow: Window, clipboard: {}, nativeImage: {}, ipcMain: { on: (_channel, fn) => { ready = fn } } }
  const load = sourceLoader({ electron: deps, '../utils/logger': { scopedLoggers: { window: { warn() {} } } },
    './share-image-split': {} })
  const { createShareCaptureHost } = load('apps/desktop/src/main/lib/share-capture-window.ts')
  const host = createShareCaptureHost(deps)
  const signal = new AbortController().signal
  const first = host.exportMermaidDiagram({ source: 'first' }, signal)
  const second = host.exportMermaidDiagram({ source: 'second' }, signal)
  const third = host.exportMermaidDiagram({ source: 'third' }, signal)
  const turn = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
  await turn(); assert.deepEqual(starts, ['first'])
  const diagram = { data: new Uint8Array([1]), width: 1, height: 1 }
  ready({ sender: windows[0].webContents }, { requestId: windows[0].message.requestId, diagram })
  assert.equal(await first, diagram)
  await turn(); assert.deepEqual(starts, ['first', 'second'])
  const failed = assert.rejects(second, /fixture failure/)
  ready({ sender: windows[1].webContents }, { requestId: windows[1].message.requestId, error: 'fixture failure' })
  await failed; await turn()
  assert.deepEqual(starts, ['first', 'second', 'third'])
  ready({ sender: windows[2].webContents }, { requestId: windows[2].message.requestId, diagram })
  assert.equal(await third, diagram)
  assert(windows.every((window) => window.destroyed))
})

test('portable import configures isolated host paths; marker failure is swallowed and mkdir failure escapes', () => {
  const calls = [], environment = { VIDBEE_PORTABLE_DIR: '/portable/new' }
  const noop = () => {}
  const overrides = { $process: { env: environment },
    'node:fs': { readFileSync: () => { throw new Error('marker read') },
      mkdirSync: (p) => calls.push(['mkdir', p]), writeFileSync: () => { throw new Error('marker write') } },
    electron: { app: { isPackaged: true, setPath: (key, value) => calls.push(['path', key, value]) } } }
  const module = sourceLoader(overrides)('apps/desktop/src/main/portable.ts')
  assert.equal(module.previousPortableRoot, '')
  assert.equal(module.getPortableDownloadsPath(), '/portable/new/Downloads')
  assert.equal(environment.HOME, '/portable/new/Data/Home')
  assert.equal(calls.filter(([kind]) => kind === 'mkdir').length, 18)
  assert.doesNotThrow(() => module.rememberPortableRoot())
  assert.throws(() => sourceLoader({ ...overrides, 'node:fs': { ...overrides['node:fs'], mkdirSync: () => { throw new Error('mkdir') } } })
    ('apps/desktop/src/main/portable.ts'), /mkdir/)
})

test('logger config retains production/development thresholds, error catching and location line', () => {
  for (const development of [false, true]) {
    const calls = []
    const log = { transports: { console: {}, ipc: {}, file: { getFile: () => ({ path: '/synthetic/log' }) } },
      errorHandler: { startCatching: (options) => calls.push(options) }, info: (...args) => calls.push(args) }
    sourceLoader({ $process: { env: { NODE_ENV: development ? 'development' : 'production' } },
      electron: {}, '@vidbee/logger/legacy': { initVidbeeLogger: () => {} }, 'electron-log/main': log })
      ('apps/desktop/src/main/config/logger-config.ts').configureLogger()
    assert.equal(log.transports.console.level, development ? 'silly' : 'info')
    assert.equal(log.transports.file.level, development ? 'silly' : 'info')
    assert.equal(log.transports.ipc.level, development ? 'silly' : false)
    assert.equal(log.transports.file.maxSize, 10 * 1024 * 1024)
    assert.equal(calls[0].showDialog, false)
    assert.deepEqual(calls[1], ['Log file location:', '/synthetic/log'])
  }
})

test('kernel subscribes before snapshot, live event wins and cleanup blocks late snapshots', async () => {
  const events = [], values = [], snapshots = []
  let callback, cleanup, retry
  const source = sourceLoader({
    jotai: { atom: (value) => value, useAtom: () => [{ ready: false }, (value) => values.push(value)] },
    react: { useEffect: (effect) => { cleanup = effect() }, useCallback: (fn) => fn },
    '../lib/logger': { logger: { error() {} } },
    '../lib/ipc': { ipcEvents: { on: (_channel, fn) => { events.push('subscribe'); callback = fn; return fn },
      removeListener: (_channel, fn) => { assert.equal(fn, callback); events.push('unsubscribe') } },
      ipcServices: { app: { getYtDlpKernelStatus: () => { events.push('snapshot'); const d = deferred(); snapshots.push(d); return d.promise },
        retryYtDlpKernelPreparation: async () => ({ ready: true, retried: true }) } } }
  })
  const module = source('apps/desktop/src/renderer/src/store/ytdlp-kernel.ts')
  retry = module.useYtDlpKernelStatus().retry
  assert.deepEqual(events, ['subscribe', 'snapshot'])
  const live = { ready: true, state: 'live' }
  callback(live)
  snapshots[0].resolve({ ready: false, state: 'stale' })
  await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(values, [live])
  await retry(); assert.equal(values.at(-1).retried, true)
  cleanup()
  module.useYtDlpKernelStatus()
  cleanup(); snapshots[1].resolve({ ready: false, state: 'disposed' })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(values.length, 2)
})

test('Show Home drops before mount, stays ordered for slow listeners, drops after unsubscribe and across reload', async () => {
  let listener, template
  const delivered = [], navigation = []
  const window = { isMinimized: () => false, show() {}, moveTop() {}, focus() {},
    webContents: { isDestroyed: () => false, isCrashed: () => false,
      send: (channel) => { if (listener) listener(channel) } } }
  const source = sourceLoader({
    electron: { app: { isReady: () => false }, BrowserWindow: { getAllWindows: () => [window] },
      Menu: { buildFromTemplate: (items) => { template = items; return items } } },
    '@vidbee/i18n': { translationResources: { en: {} } },
    '../settings': { settingsManager: { get: () => 'en' } },
    '../utils/dock': { applyDockMenu() {} }, './share-capture-window': { isAppWindow: () => true }
  })
  const module = source('apps/desktop/src/main/lib/app-icon-menu.ts')
  module.refreshAppIconMenus()
  const click = template.find((item) => item.label === 'Show Home').click
  const turn = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
  click(); await turn()
  listener = (channel) => { delivered.push(channel); navigation.push(new Promise(() => {})) }
  assert.deepEqual(delivered, [])
  click(); click(); click(); await turn()
  assert.deepEqual(delivered, ['app:show-home', 'app:show-home', 'app:show-home'])
  assert.equal(navigation.length, 3)
  listener = undefined; click(); await turn()
  listener = (channel) => delivered.push(channel)
  assert.equal(delivered.length, 3)
  // A new renderer sink replaces the vanished document; the main host has no replay storage.
  const newDocument = []
  listener = (channel) => newDocument.push(channel)
  assert.deepEqual(newDocument, [])
  click(); await turn(); assert.deepEqual(newDocument, ['app:show-home'])
})

test('transcription follow-up is detached and starts after the settings broadcast', async () => {
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', new URL('./detached-fixture.mjs', import.meta.url).pathname],
    { encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, result.stderr)
})

test('installed electron-log dispatches six scoped levels with original arguments and configured thresholds', () => {
  const Logger = sourceLoader()('node_modules/electron-log/src/core/Logger.js')
  for (const development of [true, false]) {
    const sinks = { console: [], file: [], ipc: [] }
    const factories = Object.fromEntries(Object.keys(sinks).map((name) => [name, () => {
      const transport = (message) => sinks[name].push(message)
      transport.getFile = () => ({ path: '/synthetic/log' })
      return transport
    }]))
    const log = new Logger({ logId: `foundation-${development}`, transportFactories: factories })
    log.errorHandler = { startCatching() {} }
    sourceLoader({ $process: { env: { NODE_ENV: development ? 'development' : 'production' } },
      electron: {}, '@vidbee/logger/legacy': { initVidbeeLogger() {} }, 'electron-log/main': log })
      ('apps/desktop/src/main/config/logger-config.ts').configureLogger()
    for (const sink of Object.values(sinks)) sink.length = 0
    const argument = { identity: true }, error = new Error('fixture')
    const scoped = log.scope('foundation')
    const levels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']
    for (const level of levels) scoped[level]('ordered', argument, error)
    for (const [name, output] of Object.entries(sinks)) {
      assert.deepEqual(output.map((message) => message.level), development ? levels : name === 'ipc' ? [] : levels.slice(0, 3))
      for (const message of output) {
        assert.equal(message.scope, 'foundation')
        assert.equal(message.data.length, 3)
        assert.equal(message.data[0], 'ordered'); assert.equal(message.data[1], argument); assert.equal(message.data[2], error)
      }
    }
  }
})

test('legacy share capture returns ArrayBuffer bytes and clipboard forwarding retains identity', async () => {
  let forwarded
  const load = sourceLoader({ electron: { BrowserWindow: {} },
    'electron-ipc-decorator': { IpcService: class {}, IpcMethod: () => () => {} },
    '../../lib/share-capture-window': { captureShareCardPng: async () => Buffer.from([137, 80, 78, 71]),
      writeShareImagePng: (value) => { forwarded = value } } })
  const { WindowService } = load('apps/desktop/src/main/ipc/services/window-service.ts')
  const service = new WindowService()
  const bytes = await service.captureShareCard({}, { kind: 'caption' })
  assert.equal(Object.prototype.toString.call(bytes), '[object ArrayBuffer]')
  assert.deepEqual(Array.from(new Uint8Array(bytes)), [137, 80, 78, 71])
  service.writeShareImage({}, bytes)
  assert.equal(forwarded, bytes)
})
