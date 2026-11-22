import assert from 'node:assert/strict'
import { it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { createIpcProxy } from 'electron-ipc-decorator/client'
import { makeInvocationEntry } from '../../src/renderer/src/runtime/RendererInvocation.entry.js'

it('invokePromise exact Promise-turn parity with the installed legacy invoke proxy', async () => {
  const runtime = ManagedRuntime.make(Layer.empty)
  await runtime.context()
  try {
    for (const delayed of [false, true]) {
      for (const failed of [false, true]) {
        const traces = []
        for (const migrated of [false, true]) {
          const trace = []
          const failure = new Error('same deliberate failure')
          let complete
          const entry = makeInvocationEntry(runtime)
          const value = migrated
            ? entry.invokePromise(
                Effect.callback((resume) => {
                  trace.push('prefix')
                  complete = () => {
                    trace.push('event')
                    resume(failed ? Effect.fail(failure) : Effect.succeed(42))
                  }
                  if (!delayed) {
                    complete()
                  }
                })
              )
            : createIpcProxy({
                invoke: () => {
                  trace.push('prefix')
                  const promise = Promise.withResolvers()
                  complete = () => {
                    trace.push('event')
                    if (failed) {
                      promise.reject(failure)
                    } else {
                      promise.resolve(42)
                    }
                  }
                  if (!delayed) {
                    complete()
                  }
                  return promise.promise
                }
              }).fixture.invoke()
          value.then(
            (value) => trace.push(`then:${value}`),
            (error) => {
              assert.equal(error, failure)
              trace.push('catch:same')
            }
          )
          trace.push('returned')
          for (let turn = 0; turn < 16; turn++) {
            await Promise.resolve()
            trace.push(`turn:${turn}`)
            if (delayed && turn === 2) {
              complete()
            }
          }
          await value.catch(() => {})
          entry.close(() => {})
          traces.push(trace)
        }
        assert.deepEqual(traces[1], traces[0], JSON.stringify({ delayed, failed, traces }))
      }
    }
  } finally {
    await runtime.dispose()
  }
})
