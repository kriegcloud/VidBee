import { describe, expect, it } from '@effect/vitest'
import { $DesktopId } from '@vidbee/identity/packages'
import * as Effect from 'effect/Effect'
import * as Atom from 'effect/reactivity/Atom'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { createStore } from 'jotai/vanilla'
import { sourceLoader } from '../../../../scripts/desktop-foundation/source-harness.mjs'
import { measureValue } from '../../src/renderer/src/transport/ElectronRpc.model'
import { pack, unpack } from '../../src/renderer/src/transport/RpcObservation.model'

const noop = () => {}
function legacyWindow(frozen, mode) {
  const handlers = new Map(),
    trace = []
  let native, release
  const options = {
    electron: {
      ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
      BrowserWindow: { getFocusedWindow: () => null }
    },
    $console: { ...console, error: noop },
    '../lib/share-capture-window': {
      captureShareCardPng: () => {
        trace.push('native')
        return native()
      },
      writeShareImagePng: noop
    },
    '../../lib/share-capture-window': {
      captureShareCardPng: () => {
        trace.push('native')
        return native()
      },
      writeShareImagePng: noop
    },
    '../../../../../apps/desktop/src/main/lib/share-capture-window': {
      captureShareCardPng: () => {
        trace.push('native')
        return native()
      },
      writeShareImagePng: noop
    }
  }
  const load = sourceLoader(options)
  options['electron-ipc-decorator'] = load(
    'node_modules/electron-ipc-decorator/dist/index.cjs',
    true
  )
  const error = new Error('capture failure')
  const bytes = load.inRealm('new Uint8Array([1,2,3])')
  const fulfilled = load.inRealm('value => Promise.resolve(value)')
  const rejected = load.inRealm('error => Promise.reject(error)')
  if (mode === 'throw') {
    native = () => {
      throw error
    }
  }
  if (mode === 'fulfilled') {
    native = () => fulfilled(bytes)
  }
  if (mode === 'rejected') {
    native = () => rejected(error)
  }
  if (mode.startsWith('deferred')) {
    const deferred = load.inRealm('Promise.withResolvers()')
    native = () => deferred.promise
    release = () => (mode === 'deferred-success' ? deferred.resolve(bytes) : deferred.reject(error))
  }
  const path = frozen
    ? 'scripts/desktop-foundation/fixtures/frozen-ipc/services/window-service.ts'
    : 'apps/desktop/src/main/legacy/window-service.ts'
  const service = new (load(path, true).WindowService)()
  return { service, handlers, trace, release, error }
}
async function captureClock(frozen, mode, registered) {
  const h = legacyWindow(frozen, mode)
  let turn = 0,
    outcome
  const result = registered
    ? h.handlers.get('window.captureShareCard')({ sender: {} }, {})
    : h.service.captureShareCard({}, {})
  expect(h.trace).toEqual(['native'])
  result.then(
    (value) => {
      outcome = { turn, bytes: Array.from(new Uint8Array(value)) }
    },
    (error) => {
      expect(error).toBe(h.error)
      outcome = { turn, error: error.message }
    }
  )
  for (turn = 1; turn <= 24; turn++) {
    if (turn === 8) {
      h.release?.()
    }
    await Promise.resolve()
    if (outcome) {
      break
    }
  }
  expect(outcome).toBeDefined()
  return outcome
}

describe('review legacy and real registry boundaries', () => {
  for (const registered of [false, true]) {
    for (const mode of ['throw', 'fulfilled', 'rejected', 'deferred-success', 'deferred-failure']) {
      it(`capture exact native promise-turn parity: ${registered ? 'registered invoke' : 'direct method'} / ${mode}`, async () => {
        expect(await captureClock(false, mode, registered)).toEqual(
          await captureClock(true, mode, registered)
        )
      })
    }
  }
  it('retains old admission behavior with 65 held native dialogs and drains their real completion', async () => {
    const pending = [],
      handlers = new Map()
    const load = sourceLoader({
      electron: {
        app: { getVersion: () => 'test' },
        ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
        BrowserWindow: { getFocusedWindow: () => null },
        dialog: {
          showMessageBox: () => {
            const d = load.inRealm('Promise.withResolvers()')
            pending.push(d)
            return d.promise
          }
        }
      },
      '../lib/ffmpeg-manager': { ffmpegManager: { isReady: () => Promise.resolve(true) } },
      '../lib/ytdlp-manager': { ytdlpManager: { isReady: () => true } },
      '../lib/ytdlp-kernel-host': { getYtDlpKernelService: () => ({ getStatus: () => ({}) }) },
      '../utils/logger': { scopedLoggers: { system: { warn: noop } } },
      $console: { ...console, error: noop }
    })
    const { AppService } = load('apps/desktop/src/main/legacy/app-service.ts', true)
    const service = new AppService()
    expect(service).toBeInstanceOf(AppService)
    const outcomes = Array.from({ length: 65 }, () =>
      handlers
        .get('app.showMessageBox')({ sender: {} }, { message: 'held' })
        .then(
          () => 'ok',
          (error) => error
        )
    )
    expect(pending).toHaveLength(65)
    const owner = load('apps/desktop/src/main/legacy/foundation-runtime.ts', true)
    owner.closeLegacyNativeAdmission()
    let drained = false
    const drain = owner.foundationRuntime.runPromise(owner.drainLegacyNative).then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    for (const d of pending) {
      d.resolve({ response: 0, checkboxChecked: false })
    }
    expect(await Promise.all(outcomes)).toEqual(new Array(65).fill('ok'))
    await drain
    expect(drained).toBe(true)
    await owner.foundationRuntime.dispose()
  })
  it('reconciles cached unmounted reads on mount/remount across two actual Jotai stores', async () => {
    const registry = AtomRegistry.make(),
      source = Atom.make('before').pipe(Atom.keepAlive)
    const load = sourceLoader({
      '../legacy/document': {
        getDesktopDocument: () => ({
          registry,
          storage: { write: (atom, value) => registry.set(atom, value) }
        })
      }
    })
    const { projectFoundationAtom } = load(
      'apps/desktop/src/renderer/src/lib/foundation-state.ts',
      true
    )
    const projected = projectFoundationAtom(source),
      stores = [createStore(), createStore()],
      releases = []
    try {
      for (const store of stores) {
        expect(store.get(projected)).toBe('before')
      }
      registry.set(source, 'after')
      for (const store of stores) {
        const seen = []
        const release = store.sub(projected, () => seen.push(store.get(projected)))
        releases.push(release)
        await Promise.resolve()
        expect(store.get(projected)).toBe('after')
        registry.set(source, 'mounted')
        expect(store.get(projected)).toBe('mounted')
        expect(seen).toContain('mounted')
        store.set(projected, 'written')
        expect(store.get(projected)).toBe('written')
        release()
        registry.set(source, 'gap')
        const remount = store.sub(projected, () => {})
        releases.push(remount)
        expect(store.get(projected)).toBe('gap')
        remount()
        registry.set(source, 'after')
      }
    } finally {
      for (const release of releases) {
        release()
      }
      registry.dispose()
    }
  })
  it.each([
    ['FoundationClient.service', 'FoundationClient'],
    ['About.atoms', 'FoundationAbout'],
    ['FoundationFailures.service', 'FoundationFailures']
  ])('composes %s through the package owner', (file, name) => {
    const seen = []
    const load = sourceLoader({
      '@vidbee/identity/packages': {
        $DesktopId: {
          ...$DesktopId,
          create: (path) =>
            new Proxy($DesktopId.create(path), {
              apply: (target, self, args) => {
                seen.push([path, args[0][0]])
                return Reflect.apply(target, self, args)
              }
            })
        }
      }
    })

    const owner = load(`apps/desktop/src/renderer/src/runtime/${file}.ts`, true)[name]
    const path = `renderer/src/runtime/${file}`
    expect(seen).toContainEqual([path, name])
    const id = $DesktopId.create(path)
    const expected =
      name === 'FoundationClient'
        ? id`FoundationClient`
        : name === 'FoundationAbout'
          ? id`FoundationAbout`
          : id`FoundationFailures`
    expect(owner.key).toBe(expected)
  })
})

it('retains finite observation byte/depth and decoded-value admission failures', async () => {
  const oversized = 'x'.repeat(12 * 1024 * 1024)
  for (const effect of [
    pack(oversized),
    unpack({ t: 's', v: oversized }),
    pack(Array.from({ length: 65 }).reduce((value) => ({ next: value }), null))
  ]) {
    const result = await Effect.runPromise(Effect.result(effect))
    expect(result._tag).toBe('Failure')
    expect(result.failure.reason).toBe('ObservationCapacity')
  }
  expect(measureValue(new Array(1024 * 1024 + 1).fill(null))).toBeUndefined()
  expect(
    measureValue(Array.from({ length: 257 }).reduce((child) => ({ next: child }), null))
  ).toBeUndefined()
})
