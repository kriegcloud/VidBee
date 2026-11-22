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
