import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Atom from 'effect/reactivity/Atom'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { makeAboutActions } from '../../src/renderer/src/runtime/About.atoms'
import { makeFoundationAtoms } from '../../src/renderer/src/runtime/Foundation.atoms'
import { makeFoundationStorage } from '../../src/renderer/src/runtime/FoundationStorage.service'
import { makeSettingsActions } from '../../src/renderer/src/runtime/Settings.atoms'
import { makeRetentionLedger } from '../../src/renderer/src/transport/ElectronRpc.model'

function owner(limit = 8192) {
  const registry = AtomRegistry.make(),
    ledger = makeRetentionLedger({ documentBytes: limit, windowBytes: limit })
  ledger.connect('doc', 'window')
  const errors = []
  const storage = makeFoundationStorage({
    registry,
    account: ledger.document('doc'),
    report: (error) => errors.push(error)
  })
  return {
    registry,
    ledger,
    storage,
    errors,
    close: () => {
      storage.close()
      registry.dispose()
      ledger.disconnect('doc')
    }
  }
}
describe('foundation document state ownership', () => {
  it('transfers a whole rollback reference without a double reservation and handles reentrant writes', () => {
    const h = owner(),
      atom = Atom.make('before').pipe(Atom.keepAlive)
    try {
      h.storage.write(atom, 'before')
      const before = h.ledger.stats().data
      const saved = h.storage.capture(atom, 'before')
      h.storage.write(atom, 'optimistic')
      expect(h.storage.stats()).toEqual({ atoms: 1, rollbacks: 1 })
      saved.restore()
      saved.release()
      expect(h.registry.get(atom)).toBe('before')
      expect(h.ledger.stats().data).toBe(before)
      expect(h.storage.stats()).toEqual({ atoms: 1, rollbacks: 0 })
      const stop = h.registry.subscribe(atom, (value) => {
        if (value === 'outer') {
          h.storage.write(atom, 'inner')
        }
      })
      h.storage.write(atom, 'outer')
      expect(h.registry.get(atom)).toBe('inner')
      stop()
      expect(h.ledger.stats().leases).toBe(1)
    } finally {
      h.close()
    }
    expect(h.ledger.stats().data).toBe(0)
    expect(h.ledger.stats().leases).toBe(0)
  })
  it('reports capacity before replacing a snapshot and forbids late writes after document close', () => {
    const h = owner(512),
      atom = Atom.make('old').pipe(Atom.keepAlive)
    h.storage.write(atom, 'old')
    expect(() => h.storage.write(atom, 'x'.repeat(1000))).toThrow()
    expect(h.registry.get(atom)).toBe('old')
    expect(h.errors).toHaveLength(1)
    h.close()
    expect(() => h.storage.write(atom, 'late')).toThrow()
    expect(h.ledger.stats().data).toBe(0)
  })
  it('joins concurrent About consumers, caches failure and owns one stable snapshot', async () => {
    const h = owner(),
      atoms = makeFoundationAtoms(),
      calls = [],
      failures = []
    try {
      const actions = await Effect.runPromise(
        makeAboutActions({
          registry: h.registry,
          atoms,
          storage: h.storage,
          calls: {
            getVersion: Effect.sync(() => {
              calls.push('version')
              return '1'
            }),
            getOsVersion: Effect.flatMap(
              Effect.sync(() => calls.push('os')),
              () => Effect.fail('offline')
            )
          },
          report: (message, error) => Effect.sync(() => failures.push([message, error]))
        })
      )
      const results = await Effect.runPromise(
        Effect.all([actions.load, actions.load], { concurrency: 'unbounded' })
      )
      expect(results).toEqual([
        { appVersion: '', osVersion: '' },
        { appVersion: '', osVersion: '' }
      ])
      await Effect.runPromise(actions.load)
      expect(calls).toEqual(['version', 'os'])
      expect(failures).toHaveLength(1)
      expect(h.registry.get(atoms.appInfoLoaded)).toBe(true)
    } finally {
      h.close()
    }
    expect(h.ledger.stats().leases).toBe(0)
  })
  it('releases an optimistic rollback when invocation admission refuses before the Effect starts', async () => {
    const h = owner(1024 * 1024),
      atoms = makeFoundationAtoms(),
      logs = []
    try {
      const initial = h.registry.get(atoms.settings)
      const actions = makeSettingsActions({
        state: {
          read: () => h.registry.get(atoms.settings),
          write: (value) => h.storage.write(atoms.settings, value),
          capture: (value) => h.storage.capture(atoms.settings, value),
          loaded: () => {}
        },
        calls: { set: () => Effect.fail('not started') },
        host: { report: (...args) => Effect.sync(() => logs.push(args)) }
      })
      const refused = actions.prepareSave({ key: 'theme', value: 'light' })
      expect(h.registry.get(atoms.settings).theme).toBe('light')
      expect(h.storage.stats().rollbacks).toBe(1)
      refused.refuse(true)
      expect(h.registry.get(atoms.settings)).toBe(initial)
      expect(h.storage.stats().rollbacks).toBe(0)
      refused.refuse(true)
      const departed = actions.prepareSave({ key: 'theme', value: 'dark' })
      departed.refuse(false)
      expect(h.storage.stats().rollbacks).toBe(0)
      await Effect.runPromise(departed.effect)
      expect(h.registry.get(atoms.settings).theme).toBe('dark')
      expect(logs).toEqual([])
    } finally {
      h.close()
    }
    expect(h.ledger.stats().data).toBe(0)
  })
})
