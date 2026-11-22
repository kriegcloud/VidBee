import assert from 'node:assert/strict'
import { it } from '@effect/vitest'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { makeElectronWire } from '../../src/main/ipc/ElectronRpcServer.driver.js'
import { makeBridgeConnection } from '../../src/renderer/src/transport/DesktopRpcConnection.driver.js'
import { channels } from '../../src/renderer/src/transport/ElectronRpc.model.js'

it('native driver partial listener installation releases exact acquired handlers', async () => {
  const listeners = new Map()
  const handlers = new Map()
  const original = new Error('native callback registration failed after installation')
  const wire = makeElectronWire({
    ipc: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
      on: (channel, listener) => {
        listeners.set(channel, listener)
        if (channel === channels.end) {
          throw original
        }
      },
      removeListener: (channel, listener) => {
        if (listeners.get(channel) === listener) {
          listeners.delete(channel)
        }
      }
    },
    authority: {
      registeredRole: () => undefined,
      packagedRendererUrl: 'file:///denied',
      allowsProcedure: () => false
    }
  })
  const result = await Effect.runPromise(
    Effect.exit(
      Effect.scoped(
        wire.listen(
          () => {},
          () => {}
        )
      )
    )
  )
  assert(Exit.isFailure(result))
  assert.equal(Cause.squash(result.cause), original)
  assert.equal(listeners.size, 0)
  assert.equal(handlers.size, 0)
})

it('preload connection has no unaccounted startup queue and releases listener and session exactly once', async () => {
  let nativeReceive
  let removals = 0
  let disconnects = 0
  let deliveries = 0
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* makeBridgeConnection({
          subscribe: (receive) => {
            nativeReceive = receive
            return () => {
              removals++
            }
          },
          connect: () => {
            for (let index = 0; index < 10_000; index++) {
              nativeReceive('unsolicited before connect')
            }
            return Promise.resolve({ session: 'doc', generation: 1, version: 1 })
          },
          send: () => {},
          disconnect: () => {
            disconnects++
          }
        })
        yield* connection.listen(() => {
          deliveries++
        })
        nativeReceive('owned callback')
        assert.equal(deliveries, 1)
      })
    )
  )
  nativeReceive('late callback')
  assert.equal(deliveries, 1)
  assert.equal(removals, 1)
  assert.equal(disconnects, 1)
})

it('fix3 R1: application authority rejects unregistered, wrong URL, subframe, stale and wrong-role senders', async () => {
  const handlers = new Map()
  const listeners = new Map()
  const frame = { url: 'https://untrusted.invalid/', send() {} }
  const contents = {
    id: 99,
    mainFrame: frame,
    isDestroyed: () => false,
    on() {},
    removeListener() {}
  }
  let role
  const wire = makeElectronWire({
    ipc: {
      handle: (channel, callback) => handlers.set(channel, callback),
      removeHandler: (channel) => handlers.delete(channel),
      on: (channel, callback) => listeners.set(channel, callback),
      removeListener: (channel) => listeners.delete(channel)
    },
    authority: {
      registeredRole: (sender) => (sender === contents ? role : undefined),
      packagedRendererUrl: 'file:///app/renderer/index.html',
      developmentRendererUrl: 'http://localhost:5173/',
      allowsProcedure: (role, tag) => role === 'visible' || tag === 'Capture.Result'
    }
  })
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let received = 0
        yield* wire.listen(
          () => {
            received++
          },
          () => {}
        )
        const connect = handlers.get(channels.connect)
        const event = { sender: contents, senderFrame: frame }
        assert.throws(() => connect(event), 'unregistered remote document must be refused')
        frame.url = 'file:///app/renderer/index.html'
        assert.throws(() => connect(event), 'unregistered packaged document must be refused')
        frame.url = 'https://untrusted.invalid/'
        role = 'visible'
        assert.throws(() => connect(event), 'registered remote document must be refused')
        frame.url = 'file:///app/renderer/evil.html'
        assert.throws(() => connect(event))
        frame.url = 'http://localhost:5173/'
        assert.throws(() => connect({ ...event, senderFrame: {} }))
        const session = connect(event).session
        assert.equal(yield* wire.authorize(session, 'Settings.Read'), true)
        role = 'capture'
        assert.equal(yield* wire.authorize(session, 'Settings.Read'), false)
        const capture = connect(event).session
        assert.equal(yield* wire.authorize(capture, 'Settings.Read'), false)
        assert.equal(yield* wire.authorize(capture, 'Capture.Result'), true)
        contents.mainFrame = { ...frame }
        listeners.get(channels.message)(event, 'stale')
        assert.equal(received, 0)
        assert.equal(yield* wire.authorize(capture, 'Capture.Result'), false)
      })
    )
  )
})

it('fix4 R5/R6: navigation generations stay revoked until trusted commit and replacement fits sixteen slots', async () => {
  const handlers = new Map()
  const listeners = new Map()
  const windows = []
  const makeWindow = (id) => {
    const callbacks = new Map()
    const contents = {
      id,
      mainFrame: { url: 'http://localhost:5173/', send() {} },
      isDestroyed: () => false,
      on(name, fn) {
        const list = callbacks.get(name) ?? []
        list.push(fn)
        callbacks.set(name, list)
        return this
      },
      removeListener(name, fn) {
        callbacks.set(
          name,
          (callbacks.get(name) ?? []).filter((item) => item !== fn)
        )
        return this
      },
      emit(name, ...args) {
        for (const fn of [...(callbacks.get(name) ?? [])]) {
          fn(...args)
        }
      }
    }
    windows.push(contents)
    return contents
  }
  const wire = makeElectronWire({
    ipc: {
      handle: (key, fn) => handlers.set(key, fn),
      removeHandler: (key) => handlers.delete(key),
      on: (key, fn) => listeners.set(key, fn),
      removeListener: (key) => listeners.delete(key)
    },
    authority: {
      registeredRole: (sender) => (windows.includes(sender) ? 'visible' : undefined),
      packagedRendererUrl: 'file:///app/index.html',
      developmentRendererUrl: 'http://localhost:5173/',
      allowsProcedure: () => true
    }
  })
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let messages = 0
        yield* wire.listen(
          () => {
            messages++
          },
          () => {}
        )
        const connect = (contents) =>
          handlers.get(channels.connect)({ sender: contents, senderFrame: contents.mainFrame })
        const first = makeWindow(1),
          second = makeWindow(2)
        const old = connect(first),
          independent = connect(second)
        first.emit('did-start-navigation', {}, 'https://untrusted.invalid/', false, true)
        assert.equal(yield* wire.authorize(old.session, 'Echo'), false)
        assert.throws(
          () => connect(first),
          'departing old document must not reconnect before commit'
        )
        listeners.get(channels.message)(
          { sender: first, senderFrame: first.mainFrame },
          'late old frame'
        )
        assert.equal(messages, 0)
        first.emit(
          'did-fail-provisional-load',
          {},
          -3,
          'ERR_ABORTED',
          'https://untrusted.invalid/',
          true,
          1,
          1
        )
        assert.throws(() => connect(first), 'cancellation must not revive revoked authority')
        first.emit('did-frame-navigate', {}, 'http://localhost:5173/', 200, 'OK', false, 1, 2)
        assert.throws(() => connect(first), 'subframe commit must not reopen main admission')
        first.mainFrame = { url: 'https://untrusted.invalid/', send() {} }
        first.emit('did-frame-navigate', {}, first.mainFrame.url, 200, 'OK', true, 2, 1)
        assert.throws(() => connect(first))
        first.emit('did-start-navigation', {}, 'http://localhost:5173/', false, true)
        first.mainFrame = { url: 'http://localhost:5173/', send() {} }
        first.emit('did-frame-navigate', {}, first.mainFrame.url, 200, 'OK', true, 3, 1)
        const reloaded = connect(first)
        assert.notEqual(reloaded.session, old.session)
        assert.equal(yield* wire.authorize(reloaded.session, 'Echo'), true)
        assert.equal(yield* wire.authorize(independent.session, 'Echo'), true)
        first.emit('did-start-navigation', {}, 'http://localhost:5173/#same', true, true)
        assert.equal(yield* wire.authorize(reloaded.session, 'Echo'), true)
        for (let id = 3; id <= 16; id++) {
          connect(makeWindow(id))
        }
        const replacement = connect(first)
        assert.notEqual(replacement.session, reloaded.session)
        assert.equal(yield* wire.authorize(replacement.session, 'Echo'), true)
        assert.equal(yield* wire.authorize(reloaded.session, 'Echo'), false)
        assert.throws(() => connect(makeWindow(17)))
        assert.equal(yield* wire.authorize(independent.session, 'Echo'), true)
      })
    )
  )
})

it('fix4 survivor: URL host and credential guards reject otherwise identical development URLs', async () => {
  const handlers = new Map()
  const frame = { url: 'http://localhost:5173/', send() {} }
  const contents = {
    id: 1,
    mainFrame: frame,
    on() {},
    removeListener() {},
    isDestroyed: () => false
  }
  const wire = makeElectronWire({
    ipc: {
      handle: (key, fn) => handlers.set(key, fn),
      removeHandler: (key) => handlers.delete(key),
      on() {},
      removeListener() {}
    },
    authority: {
      registeredRole: () => 'visible',
      packagedRendererUrl: 'file:///app/index.html',
      developmentRendererUrl: 'http://localhost:5173/',
      allowsProcedure: () => true
    }
  })
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* wire.listen(
          () => {},
          () => {}
        )
        const connect = () =>
          handlers.get(channels.connect)({ sender: contents, senderFrame: frame })
        for (const url of [
          'http://evil.invalid:5173/',
          'http://localhost.evil.invalid:5173/',
          'http://user@localhost:5173/',
          'http://:password@localhost:5173/',
          'http://user:password@localhost:5173/'
        ]) {
          frame.url = url
          assert.throws(connect, url)
        }
        frame.url = 'http://localhost:5173/?app=1#route'
        assert(connect().session)
      })
    )
  )
})

it('fix4 R6: a connected window replaces its document at the sixteen-document ceiling', async () => {
  const handlers = new Map()
  const listeners = new Map()
  const windows = []
  const makeWindow = (id) => {
    const callbacks = new Map()
    const contents = {
      id,
      mainFrame: { url: 'http://localhost:5173/', send() {} },
      isDestroyed: () => false,
      on(name, fn) {
        const list = callbacks.get(name) ?? []
        list.push(fn)
        callbacks.set(name, list)
        return this
      },
      removeListener(name, fn) {
        callbacks.set(
          name,
          (callbacks.get(name) ?? []).filter((item) => item !== fn)
        )
        return this
      },
      emit(name, ...args) {
        for (const fn of [...(callbacks.get(name) ?? [])]) {
          fn(...args)
        }
      }
    }
    windows.push(contents)
    return contents
  }
  const wire = makeElectronWire({
    ipc: {
      handle: (key, fn) => handlers.set(key, fn),
      removeHandler: (key) => handlers.delete(key),
      on: (key, fn) => listeners.set(key, fn),
      removeListener: (key) => listeners.delete(key)
    },
    authority: {
      registeredRole: (sender) => (windows.includes(sender) ? 'visible' : undefined),
      packagedRendererUrl: 'file:///app/index.html',
      developmentRendererUrl: 'http://localhost:5173/',
      allowsProcedure: () => true
    }
  })
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* wire.listen(
          () => {},
          () => {}
        )
        const connect = (contents) =>
          handlers.get(channels.connect)({ sender: contents, senderFrame: contents.mainFrame })
        const first = makeWindow(1),
          second = makeWindow(2)
        const old = connect(first)
        const independent = connect(second)
        for (let id = 3; id <= 16; id++) {
          connect(makeWindow(id))
        }
        const replacement = connect(first)
        assert.notEqual(replacement.session, old.session)
        assert.equal(yield* wire.authorize(replacement.session, 'Echo'), true)
        assert.equal(yield* wire.authorize(old.session, 'Echo'), false)
        assert.throws(() => connect(makeWindow(17)))
        assert.equal(yield* wire.authorize(independent.session, 'Echo'), true)
      })
    )
  )
})

const review3WindowFixture = () => {
  const handlers = new Map()
  const ipcListeners = new Map()
  const registered = new Set()
  const departed = []
  const makeWindow = (id) => {
    const callbacks = new Map()
    const contents = {
      id,
      mainFrame: { url: 'http://localhost:5173/', send() {} },
      isDestroyed: () => false,
      on(name, callback) {
        const listeners = callbacks.get(name) ?? []
        listeners.push(callback)
        callbacks.set(name, listeners)
        return this
      },
      removeListener(name, callback) {
        callbacks.set(
          name,
          (callbacks.get(name) ?? []).filter((current) => current !== callback)
        )
        return this
      },
      emit(name, ...args) {
        for (const callback of [...(callbacks.get(name) ?? [])]) {
          callback(...args)
        }
      },
      listenerCount(name) {
        return (callbacks.get(name) ?? []).length
      }
    }
    registered.add(contents)
    return contents
  }
  const wire = makeElectronWire({
    ipc: {
      handle: (name, callback) => handlers.set(name, callback),
      removeHandler: (name) => handlers.delete(name),
      on: (name, callback) => ipcListeners.set(name, callback),
      removeListener: (name) => ipcListeners.delete(name)
    },
    authority: {
      registeredRole: (contents) => (registered.has(contents) ? 'visible' : undefined),
      packagedRendererUrl: 'file:///app/index.html',
      developmentRendererUrl: 'http://localhost:5173/',
      allowsProcedure: () => true
    }
  })
  return {
    wire,
    makeWindow,
    departed,
    connect: (contents) =>
      handlers.get(channels.connect)({ sender: contents, senderFrame: contents.mainFrame }),
    message: (contents) =>
      ipcListeners.get(channels.message)(
        { sender: contents, senderFrame: contents.mainFrame },
        'old frame'
      )
  }
}

it('fix5 review3 crash-listener mutation: renderer crash revokes session admission until trusted commit', async () => {
  const fixture = review3WindowFixture()
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let messages = 0
        yield* fixture.wire.listen(
          () => {
            messages++
          },
          (session) => fixture.departed.push(session)
        )
        const first = fixture.makeWindow(1),
          second = fixture.makeWindow(2)
        const old = fixture.connect(first),
          independent = fixture.connect(second)
        first.emit('render-process-gone', {}, { reason: 'crashed' })
        assert.equal(yield* fixture.wire.authorize(old.session, 'Echo'), false)
        assert.deepEqual(fixture.departed, [old.session])
        fixture.message(first)
        assert.equal(messages, 0)
        assert.throws(() => fixture.connect(first))
        assert.equal(yield* fixture.wire.authorize(independent.session, 'Echo'), true)
        first.mainFrame = { url: 'http://localhost:5173/', send() {} }
        first.emit('did-frame-navigate', {}, first.mainFrame.url, 200, 'OK', true, 2, 1)
        const reloaded = fixture.connect(first)
        assert.notEqual(reloaded.session, old.session)
        assert.equal(yield* fixture.wire.authorize(reloaded.session, 'Echo'), true)
      })
    )
  )
})

it('fix5 review3 destroyed-window mutation: destruction removes owned listeners and state without touching another window', async () => {
  const fixture = review3WindowFixture()
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* fixture.wire.listen(
          () => {},
          (session) => fixture.departed.push(session)
        )
        const first = fixture.makeWindow(1),
          second = fixture.makeWindow(2)
        let unrelated = 0
        first.on('destroyed', () => {
          unrelated++
        })
        const old = fixture.connect(first),
          independent = fixture.connect(second)
        first.emit('destroyed')
        assert.equal(unrelated, 1)
        assert.deepEqual(fixture.departed, [old.session])
        for (const event of ['did-start-navigation', 'did-frame-navigate', 'render-process-gone']) {
          assert.equal(first.listenerCount(event), 0)
        }
        assert.equal(first.listenerCount('destroyed'), 1)
        assert.equal(yield* fixture.wire.authorize(independent.session, 'Echo'), true)
        // A different registered contents object with the same ID detects stale private state.
        const replacementWindow = fixture.makeWindow(1)
        const replacement = fixture.connect(replacementWindow)
        assert.equal(yield* fixture.wire.authorize(replacement.session, 'Echo'), true)
        first.emit('render-process-gone')
        first.emit('destroyed')
        assert.equal(yield* fixture.wire.authorize(replacement.session, 'Echo'), true)
        assert.equal(unrelated, 2)
      })
    )
  )
})

it('fix5 review3 wire-scope mutation: closing the wire releases every owned per-window listener', async () => {
  const fixture = review3WindowFixture()
  const first = fixture.makeWindow(1),
    second = fixture.makeWindow(2)
  let unrelated = 0
  first.on('render-process-gone', () => {
    unrelated++
  })
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* fixture.wire.listen(
          () => {},
          (session) => fixture.departed.push(session)
        )
        fixture.connect(first)
        fixture.connect(second)
        assert.equal(first.listenerCount('render-process-gone'), 2)
        assert.equal(second.listenerCount('render-process-gone'), 1)
      })
    )
  )
  assert.equal(fixture.departed.length, 2)
  for (const contents of [first, second]) {
    for (const event of ['did-start-navigation', 'did-frame-navigate', 'destroyed']) {
      assert.equal(contents.listenerCount(event), 0)
    }
    assert.equal(contents.listenerCount('render-process-gone'), contents === first ? 1 : 0)
  }
  first.emit('render-process-gone')
  assert.equal(unrelated, 1)
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* fixture.wire.listen(
          () => {},
          () => {}
        )
        const next = fixture.makeWindow(1)
        const connected = fixture.connect(next)
        assert.equal(yield* fixture.wire.authorize(connected.session, 'Echo'), true)
      })
    )
  )
})
