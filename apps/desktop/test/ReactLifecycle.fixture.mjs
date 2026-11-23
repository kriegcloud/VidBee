// Native browser characterization fixture, bundled into the isolated Electron test application.

import { RegistryContext, RegistryProvider } from '@effect/atom-react/RegistryContext'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Atom from 'effect/reactivity/Atom'
import * as React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { makePreloadBridge } from '../src/preload/DesktopRpcBridge.driver.js'
import { makeRendererDocumentOwner } from '../src/renderer/src/runtime/RendererInvocation.entry.js'
import {
  makeResourceBudget,
  makeRetentionLedger
} from '../src/renderer/src/transport/ElectronRpc.model.js'

const check = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}
globalThis.transportReactProof = async () => {
  const runtime = ManagedRuntime.make(Layer.empty)
  await runtime.context()
  const ledger = makeRetentionLedger()
  const resources = makeResourceBudget(ledger.forWindow('window'))
  const owner = makeRendererDocumentOwner({ runtime, resources, disposeRegistry: () => {} })
  const repair = owner.recovery({ client: 'renderer', family: 'history' }).success
  repair.begin('epoch')
  repair.touch('task')
  repair.watermark({ id: 'task', sequence: 1 })
  owner.delivery.applied({
    token: { document: 'doc', client: 'renderer', generation: 1, family: 'events', serial: 1 },
    epoch: 'epoch',
    through: 1
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const registries = []
  let setups = 0
  let cleanups = 0
  let actualDisposals = 0
  let mounted
  let complete
  let staleWrites = 0
  let auth = 0
  const order = []
  const pending = owner.invokePromise(
    Effect.gen(function* () {
      yield* Effect.callback((resume) => {
        complete = resume
      })
      staleWrites++
    })
  )
  const observed = pending.then(
    () => order.push('success'),
    () => order.push('caller-rejected')
  )
  owner.registerAuth({ callback: () => auth++, retainedBytes: 256 })
  const held = Atom.make(
    Effect.never.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          actualDisposals++
          order.push('registry-disposed')
        })
      )
    )
  )
  const Probe = () => {
    const registry = React.useContext(RegistryContext)
    React.useEffect(() => {
      setups++
      registries.push(registry)
      mounted ??= registry.mount(held)
      return () => {
        cleanups++
      }
    }, [registry])
    return null
  }
  flushSync(() =>
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(RegistryProvider, null, React.createElement(Probe))
      )
    )
  )
  check(setups === 2 && cleanups === 1, 'development StrictMode setup/cleanup replay missing')
  check(
    registries.length === 2 && registries[0] === registries[1],
    'provider registry changed during replay'
  )
  check(actualDisposals === 0 && owner.pending() === 1, 'StrictMode replay retired document work')
  check(
    (await owner.invokePromise(Effect.succeed(42))) === 42,
    'provider replay lost independent invocation'
  )
  let pendingAtDispose = -1
  owner.close(() => {
    pendingAtDispose = owner.pending()
    check(ledger.stats().data === 0, 'document sub-budgets survived HMR')
    order.push('root-unmount')
    flushSync(() => root.unmount())
  })
  await observed
  owner.emitAuth()
  complete(Effect.void)
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 650))
  check(
    pendingAtDispose === 0 && staleWrites === 0 && auth === 0,
    'HMR left document work or callbacks'
  )
  check(
    actualDisposals === 1 && order.indexOf('caller-rejected') < order.indexOf('registry-disposed'),
    'caller did not settle before actual provider disposal'
  )
  let listener
  let removals = 0
  let deliveries = 0
  const bridge = makePreloadBridge({
    invoke: () => Promise.resolve({}),
    send: () => {},
    on: (_channel, receive) => {
      listener = receive
    },
    removeListener: () => {
      removals++
    }
  })
  const unsubscribe = bridge.subscribe(() => {
    deliveries++
  })
  listener({}, 'before')
  unsubscribe()
  unsubscribe()
  listener({}, 'late')
  check(removals === 1 && deliveries === 1, 'HMR unsubscribe retained preload delivery')
  const nextOwner = makeRendererDocumentOwner({ runtime, resources, disposeRegistry: () => {} })
  check(
    (await nextOwner.invokePromise(Effect.succeed('fresh'))) === 'fresh',
    'replacement owner failed'
  )
  nextOwner.close(() => {})
  mounted?.()
  container.remove()
  await runtime.dispose()
  return {
    setups,
    cleanups,
    sameRegistry: true,
    actualDisposals,
    pendingAtDispose,
    staleWrites,
    authAfterClose: auth,
    unsubscribeRemovals: removals
  }
}
