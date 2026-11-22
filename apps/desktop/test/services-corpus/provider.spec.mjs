// @vitest-environment happy-dom

import { RegistryContext } from '@effect/atom-react/RegistryContext'
import { describe, expect, it } from '@effect/vitest'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import * as Scheduler from 'effect/Scheduler'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { DesktopAtomProvider } from '../../src/renderer/src/runtime/DesktopAtomProvider'
import { makeDesktopDocument } from '../../src/renderer/src/runtime/DesktopAtomRuntime.entry'
import { FoundationClient } from '../../src/renderer/src/runtime/FoundationClient.service'
import { makeTransportFailureOwner } from '../../src/renderer/src/runtime/RendererInvocation.entry'
import { ElectronRpcTransportError } from '../../src/renderer/src/transport/DocumentDelivery.errors'

describe('borrowed document provider', () => {
  it('shares one graph through StrictMode replay, presents failure and closes only on permanent departure', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    let connects = 0,
      disconnects = 0
    const documentOwner = makeDesktopDocument({
      sendLog: () => {},
      bridge: {
        connect: async () => {
          connects++
          return { session: 'strict/1', generation: 1, version: 1 }
        },
        subscribe: () => () => {},
        send: () => {},
        disconnect: () => {
          disconnects++
        }
      }
    })
    const seen = [],
      host = document.createElement('div'),
      root = createRoot(host)
    function Child() {
      const registry = React.useContext(RegistryContext)
      React.useEffect(() => {
        seen.push(registry)
      }, [registry])
      return React.createElement('span', null, 'mounted')
    }
    try {
      await documentOwner.runtime.runPromise(documentOwner.runtime.contextEffect)
      expect(
        await documentOwner.runtime.runPromise(
          Effect.gen(function* () {
            return yield* Scheduler.Scheduler
          })
        )
      ).toBe(documentOwner.registry.scheduler)
      await React.act(async () =>
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(
              DesktopAtomProvider,
              { document: documentOwner, failureMessage: () => 'Reload to reconnect.' },
              React.createElement(Child)
            )
          )
        )
      )
      expect(seen.length).toBeGreaterThanOrEqual(2)
      expect(seen.every((registry) => registry === documentOwner.registry)).toBe(true)
      let atomContext = documentOwner.registry.get(documentOwner.atomRuntime)
      const releaseRuntime = documentOwner.registry.subscribe(
        documentOwner.atomRuntime,
        (value) => {
          atomContext = value
        }
      )
      for (let i = 0; i < 100 && !AsyncResult.isSuccess(atomContext); i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      expect(AsyncResult.isSuccess(atomContext)).toBe(true)
      const directContext = await documentOwner.runtime.runPromise(
        documentOwner.runtime.contextEffect
      )
      expect(Context.get(atomContext.value, FoundationClient)).toBe(
        Context.get(directContext, FoundationClient)
      )
      releaseRuntime()
      expect(connects).toBe(1)
      await React.act(async () =>
        documentOwner.failure.report(
          ElectronRpcTransportError.make({
            operation: 'test',
            reason: 'SourceClosed',
            message: 'closed'
          })
        )
      )
      expect(host.querySelector('[role="alert"]').textContent).toBe('Reload to reconnect.')
      await React.act(async () => root.unmount())
      expect(disconnects).toBe(0)
      documentOwner.storage.write(documentOwner.atoms.settingsLoaded, true)
      expect(documentOwner.registry.get(documentOwner.atoms.settingsLoaded)).toBe(true)
    } finally {
      await documentOwner.close()
    }
    expect(disconnects).toBe(1)
    expect(documentOwner.retentionStats().data).toBe(0)
  })
  it('retains a failure reported before any provider subscribes until document disposal', async () => {
    const registry = AtomRegistry.make(),
      failure = makeTransportFailureOwner(registry)
    try {
      failure.report(
        ElectronRpcTransportError.make({
          operation: 'connect',
          reason: 'ConnectFailed',
          message: 'early failure'
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(registry.get(failure.atom).value.message).toBe('early failure')
      failure.close()
      failure.report(
        ElectronRpcTransportError.make({
          operation: 'connect',
          reason: 'ConnectFailed',
          message: 'late failure'
        })
      )
      expect(registry.get(failure.atom).value.message).toBe('early failure')
    } finally {
      failure.close()
      registry.dispose()
    }
  })
})
