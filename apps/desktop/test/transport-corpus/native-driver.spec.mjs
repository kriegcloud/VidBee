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
