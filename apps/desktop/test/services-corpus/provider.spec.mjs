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

it('reconciles the real Jotai projection through React StrictMode detach and permanent remount', async () => {
  const { Provider, createStore, useAtomValue } = await import('jotai')
  const Atom = await import('effect/reactivity/Atom')
  const { sourceLoader } = await import('../../../../scripts/desktop-foundation/source-harness.mjs')
  const registry = AtomRegistry.make(),
    source = Atom.make('first').pipe(Atom.keepAlive),
    store = createStore()
  const load = sourceLoader({
    '../legacy/document': {
      getDesktopDocument: () => ({
        registry,
        storage: { write: (atom, value) => registry.set(atom, value) }
      })
    }
  })
  const projected = load(
    'apps/desktop/src/renderer/src/lib/foundation-state.ts',
    true
  ).projectFoundationAtom(source)
  const host = document.createElement('div')
  let root = createRoot(host),
    mounts = 0,
    cleanups = 0
  function View() {
    const value = useAtomValue(projected)
    React.useEffect(() => {
      mounts++
      return () => {
        cleanups++
      }
    }, [])
    return React.createElement('span', null, value)
  }
  const tree = () =>
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(Provider, { store }, React.createElement(View))
    )
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  try {
    expect(store.get(projected)).toBe('first')
    registry.set(source, 'before-mount')
    await React.act(async () => {
      root.render(tree())
    })
    expect(host.textContent).toBe('before-mount')
    expect(mounts).toBe(2)
    expect(cleanups).toBe(1)
    await React.act(async () => {
      registry.set(source, 'live')
    })
    expect(host.textContent).toBe('live')
    await React.act(async () => {
      root.unmount()
    })
    registry.set(source, 'gap')
    root = createRoot(host)
    await React.act(async () => {
      root.render(tree())
    })
    expect(host.textContent).toBe('gap')
  } finally {
    await React.act(async () => {
      root.unmount()
    })
    registry.dispose()
  }
})
