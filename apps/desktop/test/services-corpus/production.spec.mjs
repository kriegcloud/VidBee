import { describe, expect, it, vi } from '@effect/vitest'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as References from 'effect/References'
import { sourceLoader } from '../../../../scripts/desktop-foundation/source-harness.mjs'
import { appHostLayer } from '../../src/main/AppHost.driver'
import { makeFoundationEvents } from '../../src/main/FoundationEvents.service'
import { runFoundationServer } from '../../src/main/FoundationServer.entry'
import { makeAdmission } from '../../src/main/ipc/ElectronRpcAdmission.service'
import { AppLive } from '../../src/main/ipc/services/app-service'
import { WindowLive } from '../../src/main/ipc/services/window-service'
import { makeOperations } from '../../src/main/runtime/ApplicationOperations.layer'
import { ApplicationOperations } from '../../src/main/runtime/ApplicationOperations.service'
import { makeSynchronousHost } from '../../src/main/runtime/SynchronousHost.entry'
import { SettingsLive } from '../../src/main/Settings.layer'
import { DesktopSettings } from '../../src/main/Settings.service'
import { settingsStoreLayer } from '../../src/main/SettingsStore.driver'
import { windowHostLayer } from '../../src/main/WindowHost.driver'
import { makeDesktopDocument } from '../../src/renderer/src/runtime/DesktopAtomRuntime.entry'
import { makeFoundationCalls } from '../../src/renderer/src/runtime/FoundationCalls.service'
import { FoundationClient } from '../../src/renderer/src/runtime/FoundationClient.service'
import * as deliveryErrors from '../../src/renderer/src/transport/DocumentDelivery.errors'
import { defaultSettings } from '../../src/shared/types/index'

async function fixture({
  capture = () => Promise.resolve(new Uint8Array([1, 2, 3])),
  fetchIcon = () => Promise.reject(new Error('offline'))
} = {}) {
  const events = makeFoundationEvents(),
    admission = makeAdmission(),
    trace = []
  let document = {
    ...defaultSettings,
    downloadPath: '/downloads',
    lastSeenWhatsNew: '',
    future: { z: undefined, a: [-0, 8n] }
  }
  let failureKey
  let receiveMain, depart
  const receivers = new Map(),
    renderers = []
  let nativeResolve
  const nativeDialog = new Promise((resolve) => {
    nativeResolve = resolve
  })
  let kernel = {
    ready: false,
    state: 'preparing',
    source: null,
    ytDlpVersion: null,
    nodeVersion: null,
    progress: 0,
    preparationStep: 'copying',
    error: null
  }
  const store = settingsStoreLayer({
    open: () => ({
      environment: {
        effectiveDefaults: { ...defaultSettings, downloadPath: '/downloads' },
        defaultDownloadPath: '/downloads',
        oldDefaultDownloadPath: '/home/Downloads',
        portable: false,
        portableRoot: '',
        previousPortableRoot: '',
        hadExistingStore: true
      },
      get: (key) => document[key],
      document: () => document,
      set: (key, value) => {
        trace.push(['write', key, value])
        if (key === failureKey) {
          throw new Error('read only')
        }
        document[key] = value
      },
      replace: (value) => {
        document = { ...document, ...value }
      },
      clear: () => {
        document = {}
      }
    }),
    mkdir: (value) => trace.push(['mkdir', value]),
    rememberPortableRoot: () => {},
    locale: () => ({ language: 'en', country: 'US', timezone: 'UTC' }),
    resolve: (value) => value,
    relative: (from, to) => to.slice(from.length + 1),
    join: (a, b) => `${a}/${b}`,
    isAbsolute: (value) => value.startsWith('/'),
    trim: (value) => value.trim()
  })
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      SettingsLive.pipe(Layer.provide(store)),
      AppLive.pipe(
        Layer.provide(
          appHostLayer(() => ({
            version: () => 'fixture',
            platform: () => 'linux',
            systemVersion: () => 'test OS',
            ffmpegReady: () => Promise.resolve(true),
            ytdlpReady: () => true,
            kernelStatus: () => kernel,
            kernel: () => ({ prepare: () => Promise.resolve(true), getStatus: () => kernel }),
            quit: () => {},
            messageBox: () => nativeDialog,
            fetch: fetchIcon,
            base64: (bytes) => Buffer.from(bytes).toString('base64')
          }))
        )
      ),
      WindowLive.pipe(
        Layer.provide(
          windowHostLayer(() => ({
            focused: () => null,
            capture,
            clipboard: () => {}
          }))
        )
      ),
      Layer.effect(ApplicationOperations)(makeOperations(admission.operationAccount)),
      Layer.succeed(References.PreventSchedulerYield, true)
    )
  )
  const settings = runtime.runSync(DesktopSettings)
  const sync = makeSynchronousHost({ runtime, ...admission.synchronousAccount('test-host') })
  sync.run((call) => settings.forCall(call).initialize)
  const ready = Deferred.makeUnsafe()
  const server = runtime.runFork(
    runFoundationServer({
      admission,
      wire: {
        listen: (receive, close) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              receiveMain = receive
              depart = close
            }),
            () => Effect.void
          ),
        authorize: () => Effect.succeed(true),
        account: (session) => Effect.succeed(session.split('/')[0]),
        send: (session, frame) => Effect.sync(() => receivers.get(session)?.(frame))
      },
      handlers: {
        events,
        epoch: 'fixture-application',
        settingsNative: (entries) => ({
          entries: () => entries,
          keys: () => entries.map(([key]) => key),
          needsFollowup: () =>
            entries.some(([key, value]) => key === 'transcriptionProvider' && value !== undefined),
          language: () => trace.push(['language']),
          dock: (value) => trace.push(['dock', value]),
          login: (value) => trace.push(['login', value]),
          queue: () => trace.push(['queue']),
          followup: () => trace.push(['followup']),
          broadcast: () => {
            trace.push(['broadcast'])
            events.settings.publish('1', undefined)
          }
        })
      },
      ready: () => Deferred.doneUnsafe(ready, Exit.void)
    })
  )
  await Effect.runPromise(Deferred.await(ready))
  const createRenderer = (id) => {
    const session = `${id}/1`
    const bridge = {
      subscribe: (receive) => {
        receivers.set(session, receive)
        return () => receivers.delete(session)
      },
      connect: () => Promise.resolve({ session, generation: 1, version: 1 }),
      send: (frame) => receiveMain(frame, session, id),
      disconnect: (session) => depart(session)
    }
    const result = makeDesktopDocument({ bridge, sendLog: () => {} })
    renderers.push(result)
    return result
  }
  const renderer = createRenderer('1')
  const calls = makeFoundationCalls({
    registry: renderer.registry,
    atoms: renderer.atoms,
    storage: renderer.storage
  })
  return {
    trace,
    admission,
    events,
    renderer,
    createRenderer,
    calls,
    runtime,
    settings,
    sync,
    fail: (key) => {
      failureKey = key
    },
    raw: () => document,
    resolveDialog: nativeResolve,
    kernel: (value) => {
      kernel = value
      events.kernel.publish('1', value)
    },
    close: async () => {
      nativeResolve({ response: 0, checkboxChecked: false })
      for (const renderer of renderers) {
        await renderer.close()
      }
      // Renderer scope disposal precedes native disconnect delivery.
      for (let turn = 0; turn < 100 && admission.stats().appBytes !== 0; turn++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      await runtime.runPromise(Fiber.interrupt(server))
      await runtime.dispose()
    }
  }
}

describe('production foundation over the owned transport', () => {
  it('round trips open settings, ordered side effects, typed defaults and independent native replies', async () => {
    const h = await fixture()
    try {
      const read = await h.renderer.runtime.runPromise(h.calls.settings.getAll)
      expect(Object.keys(read.future)).toEqual(['z', 'a'])
      expect(Object.hasOwn(read.future, 'z')).toBe(true)
      expect(Object.is(read.future.a[0], -0)).toBe(true)
      expect(read.future.a[1]).toBe(8n)
      h.trace.length = 0
      await h.renderer.runtime.runPromise(
        h.calls.settings.setAll([
          ['launchAtLogin', true],
          ['hideDockIcon', false],
          ['language', 'ja']
        ])
      )
      expect(h.trace).toEqual([
        ['write', 'launchAtLogin', true],
        ['write', 'hideDockIcon', false],
        ['write', 'language', 'ja'],
        ['login', true],
        ['dock', false],
        ['language'],
        ['broadcast']
      ])
      h.fail('hideDockIcon')
      h.trace.length = 0
      await expect(
        h.renderer.runtime.runPromise(
          h.calls.settings.setAll([
            ['language', 'fr'],
            ['hideDockIcon', true]
          ])
        )
      ).rejects.toBeDefined()
      expect(h.raw().language).toBe('fr')
      expect(h.trace).toEqual([
        ['write', 'language', 'fr'],
        ['write', 'hideDockIcon', true]
      ])
      h.fail(undefined)
      h.sync.run((call) => h.settings.forCall(call).set('theme', 7))
      expect((await h.renderer.runtime.runPromise(h.calls.settings.getAll)).theme).toBe('system')
      expect(h.raw().theme).toBe(7)
      const png = await h.renderer.runtime.runPromise(
        h.calls.window.captureShareCard({
          kind: 'caption',
          quote: { before: '', after: '', quote: 'Fixture', startMs: 0, endMs: 1000 },
          tagline: 'Fixture',
          sourceTitle: 'Foundation'
        })
      )
      expect(Array.from(png)).toEqual([1, 2, 3])
      await h.renderer.runtime.runPromise(h.calls.window.writeShareImage(png))
      const first = h.renderer.runtime.runPromise(h.calls.app.showMessageBox({ message: 'first' }))
      const second = h.renderer.runtime.runPromise(h.calls.app.getVersion)
      expect(await second).toBe('fixture')
      h.resolveDialog({ response: 1, checkboxChecked: false })
      expect(await first).toEqual({ response: 1, checkboxChecked: false })
    } finally {
      await h.close()
    }
    expect(h.events.settings.size()).toBe(0)
    expect(h.admission.stats().appNative).toBe(0)
  })
  it('keeps accepted native work charged after renderer departure until native completion', async () => {
    const h = await fixture()
    try {
      const pending = h.renderer.runtime
        .runPromise(h.calls.app.showMessageBox({ message: 'native' }))
        .catch((error) => error)
      for (let turn = 0; turn < 100 && h.admission.stats().appNative === 0; turn++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(h.admission.stats().appNative).toBe(1)
      await h.renderer.close()
      expect(h.admission.stats().appNative).toBe(1)
      h.resolveDialog({ response: 0, checkboxChecked: true })
      await pending
      for (let turn = 0; turn < 100 && h.admission.stats().appNative !== 0; turn++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(h.admission.stats().appNative).toBe(0)
    } finally {
      await h.close()
    }
  })
  it('isolates windows and token generations, releases sources on reload and keeps the surviving client live', async () => {
    const h = await fixture()
    try {
      const second = h.createRenderer('2')
      await h.renderer.runtime.runPromise(h.calls.settings.getAll)
      await second.runtime.runPromise(second.calls.settings.getAll)
      await h.renderer.runtime.runPromise(h.calls.app.getYtDlpKernelStatus)
      await second.runtime.runPromise(second.calls.app.getYtDlpKernelStatus)
      expect(h.events.settings.size()).toBe(2)
      expect(h.events.kernel.size()).toBe(2)
      const firstToken = await h.renderer.runtime.runPromise(
        FoundationClient.use((client) => client.startSettings(() => {}))
      )
      const secondToken = await second.runtime.runPromise(
        FoundationClient.use((client) => client.startSettings(() => {}))
      )
      expect(firstToken).not.toEqual(secondToken)
      await expect(
        second.runtime.runPromise(
          FoundationClient.use((owner) => owner.client['Settings.GetAll']({ settings: firstToken }))
        )
      ).rejects.toBeDefined()
      const before = second.registry.get(second.atoms.settingsInvalidation)
      h.events.settings.publish('1', undefined)
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(second.registry.get(second.atoms.settingsInvalidation)).toBe(before)
      await h.renderer.close()
      for (let i = 0; i < 100 && h.events.settings.size() !== 1; i++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(h.events.settings.size()).toBe(1)
      expect(h.events.kernel.size()).toBe(1)
      expect(await second.runtime.runPromise(second.calls.app.getVersion)).toBe('fixture')
      expect(h.renderer.retentionStats().data).toBe(0)
      const reloaded = h.createRenderer('1')
      await reloaded.runtime.runPromise(reloaded.calls.settings.getAll)
      const nextToken = await reloaded.runtime.runPromise(
        FoundationClient.use((client) => client.startSettings(() => {}))
      )
      expect(nextToken).not.toEqual(firstToken)
      expect(nextToken.epoch).toBe(firstToken.epoch)
      expect(nextToken.generation).not.toBe(firstToken.generation)
    } finally {
      await h.close()
    }
    expect(h.events.settings.size()).toBe(0)
    expect(h.events.kernel.size()).toBe(0)
  })
  it('coalesces a synchronous kernel burst into an immutable latest snapshot without leaking retention', async () => {
    const h = await fixture()
    try {
      await h.renderer.runtime.runPromise(h.calls.app.getYtDlpKernelStatus)
      for (let i = 0; i < 2048; i++) {
        h.kernel({
          ready: true,
          state: 'up-to-date',
          source: 'bundled',
          ytDlpVersion: String(i),
          nodeVersion: 'node',
          progress: null,
          preparationStep: null,
          error: null
        })
      }
      const latest = {
        ready: true,
        state: 'up-to-date',
        source: 'bundled',
        ytDlpVersion: 'final',
        nodeVersion: 'node',
        progress: null,
        preparationStep: null,
        error: null
      }
      h.kernel(latest)
      latest.ytDlpVersion = 'mutated'
      for (
        let i = 0;
        i < 100 && h.renderer.registry.get(h.renderer.atoms.kernel).ytDlpVersion !== 'final';
        i++
      ) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(h.renderer.registry.get(h.renderer.atoms.kernel).ytDlpVersion).toBe('final')
      expect(h.admission.stats().appBytes).toBeLessThan(1024 * 1024)
    } finally {
      await h.close()
    }
    expect(h.admission.stats().appBytes).toBe(0)
  })
  it('keeps small calls usable while accepted capture owns raster storage', async () => {
    let finishCapture,
      lateReserve,
      started = false
    const h = await fixture({
      capture: (_payload, retention) => {
        lateReserve = retention.reserve
        expect(retention.reserve(16 * 1024 * 1024)).toBe(true)
        started = true
        return new Promise((resolve) => {
          finishCapture = resolve
        })
      }
    })
    try {
      const pending = h.renderer.runtime.runPromise(
        h.calls.window.captureShareCard({
          kind: 'caption',
          quote: { before: '', after: '', quote: 'Fixture', startMs: 0, endMs: 1000 },
          tagline: 'Fixture',
          sourceTitle: 'Foundation'
        })
      )
      for (let i = 0; i < 100 && !started; i++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(started).toBe(true)
      expect(h.admission.stats().appNative).toBe(1)
      expect(h.admission.stats().appBytes).toBeGreaterThan(16 * 1024 * 1024)
      expect(await h.renderer.runtime.runPromise(h.calls.app.getVersion)).toBe('fixture')
      finishCapture(new Uint8Array([1, 2, 3]))
      expect(Array.from(await pending)).toEqual([1, 2, 3])
      expect(h.admission.stats().appNative).toBe(0)
      expect(lateReserve(4096)).toBe(false)
    } finally {
      finishCapture?.(new Uint8Array())
      await h.close()
    }
    expect(h.admission.stats().appBytes).toBe(0)
  })
  it('accounts streamed native icon bytes through base64 reply transfer', async () => {
    const h = await fixture({
      fetchIcon: async () =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
    })
    try {
      expect(await h.renderer.runtime.runPromise(h.calls.app.getSiteIcon('fixture.invalid'))).toBe(
        'data:image/png;base64,AQID'
      )
      expect(h.admission.stats().appNative).toBe(0)
    } finally {
      await h.close()
    }
    expect(h.admission.stats().appBytes).toBe(0)
  })
  it('settles caught legacy facade calls on departure before any late application or metadata write', async () => {
    const h = await fixture(),
      logs = []
    const facade = sourceLoader({
      '../transport/DocumentDelivery.errors': deliveryErrors,
      '../legacy/document': { getDesktopDocument: () => h.renderer },
      './logger': { logger: { error: (...args) => logs.push(args) } }
    })('apps/desktop/src/renderer/src/lib/foundation.ts')
    try {
      const recovered = []
      let applied = false
      const pending = facade.runFoundationEffect(Effect.never, (error) => {
        recovered.push(error)
        return undefined
      })
      await h.renderer.close()
      await pending
      expect(recovered).toHaveLength(1)
      expect(facade.isFoundationDeparture(recovered[0])).toBe(true)
      expect(logs).toEqual([])
      expect(await facade.loadFoundationAppInfo()).toEqual({ appVersion: '', osVersion: '' })
      await facade.runFoundationEffect(
        Effect.sync(() => {
          applied = true
        }),
        () => undefined
      )
      expect(applied).toBe(false)
      // A fresh invocation after disposal is separately refused by admission.
      expect(logs).toHaveLength(1)
      expect(logs[0][0]).toBe('Failed to load app info for feedback links:')
      expect(logs[0][1].reason).toBe('InvocationCapacity')
    } finally {
      await h.close()
    }
  })
  it('starts a warmed direct invocation on the registry microtask scheduler before the next task', async () => {
    const h = await fixture()
    const facade = sourceLoader({
      '../transport/DocumentDelivery.errors': deliveryErrors,
      '../legacy/document': { getDesktopDocument: () => h.renderer },
      './logger': { logger: { error: () => {} } }
    })('apps/desktop/src/renderer/src/lib/foundation.ts')
    try {
      await h.renderer.runtime.runPromise(h.calls.app.getVersion)
      let applied = false
      const pending = facade.runFoundationEffect(
        Effect.sync(() => {
          applied = true
        })
      )
      await Promise.resolve()
      expect(applied).toBe(true)
      await pending
    } finally {
      await h.close()
    }
  })
  it('closes the affected kernel source visibly before a document revision loses safe-integer identity', async () => {
    const h = await fixture()
    try {
      await h.renderer.runtime.runPromise(h.calls.app.getYtDlpKernelStatus)
      h.renderer.storage.write(h.renderer.atoms.kernelRevision, Number.MAX_SAFE_INTEGER)
      const before = h.renderer.registry.get(h.renderer.atoms.kernel)
      h.kernel({
        ready: true,
        state: 'up-to-date',
        source: 'bundled',
        ytDlpVersion: 'next',
        nodeVersion: 'node',
        progress: null,
        preparationStep: null,
        error: null
      })
      for (
        let i = 0;
        i < 100 && h.renderer.registry.get(h.renderer.failure.atom)._tag === 'None';
        i++
      ) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(h.renderer.registry.get(h.renderer.failure.atom)._tag).toBe('Some')
      expect(h.renderer.registry.get(h.renderer.atoms.kernelRevision)).toBe(Number.MAX_SAFE_INTEGER)
      expect(h.renderer.registry.get(h.renderer.atoms.kernel)).toBe(before)
    } finally {
      await h.close()
    }
  })
})

describe('pure kernel report and legacy clock adapter', () => {
  it('preserves error-before-clock and metadata getter order with deterministic strict formatting', async () => {
    const { buildKernelErrorReport, buildKernelIssueUrl } = await import(
      '../../src/renderer/src/legacy/kernel-error-report'
    )
    const { buildKernelErrorReport: pure } = await import(
      '../../src/renderer/src/components/kernel/kernel-error-report'
    )
    const trace = []
    const status = {
      get error() {
        trace.push('error')
        return '  unavailable  '
      },
      get state() {
        trace.push('state')
        return 'error'
      },
      get source() {
        trace.push('source')
        return null
      },
      get ytDlpVersion() {
        trace.push('yt-dlp')
        return null
      },
      get nodeVersion() {
        trace.push('node')
        return null
      }
    }
    const info = {
      get appVersion() {
        trace.push('app')
        return ' 1.0 '
      },
      get osVersion() {
        trace.push('os')
        return ' Linux '
      }
    }
    const clock = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      trace.push('clock')
      return '2026-01-01T00:00:00.000Z'
    })
    let report
    try {
      report = buildKernelErrorReport(status, info)
    } finally {
      clock.mockRestore()
    }
    expect(trace).toEqual(['error', 'clock', 'app', 'os', 'state', 'source', 'yt-dlp', 'node'])
    expect(report).toBe(
      '=== VidBeep download engine error ===\nTimestamp: 2026-01-01T00:00:00.000Z\nApp version: 1.0\nOS: Linux\nState: error\nSource: none\nyt-dlp: unknown\nNode: unknown\n\n--- Error ---\nunavailable\n\n=== End of report ==='
    )
    expect(pure(status, info, '2026-01-01T00:00:00.000Z', 'unavailable')).toBe(report)
    const url = new URL(buildKernelIssueUrl('x'.repeat(4001), info))
    expect(url.searchParams.get('logs')).toBe(`${'x'.repeat(4000)}\n…(truncated)`)
    expect(url.searchParams.get('app_version')).toBe('VidBeep v1.0')
  })
})
