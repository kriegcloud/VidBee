import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from '@effect/vitest'
import { Transpiler } from 'bun'
import * as Result from 'effect/Result'
import { snapshotPublication } from '../../src/main/ipc/Publication.service.js'
import { publishAgentEvent, subscribeAgentEvents } from '../../src/main/lib/agent-events.js'
import { makeRecovery } from '../../src/renderer/src/runtime/StreamRecovery.atoms.js'
import { makeRetentionLedger } from '../../src/renderer/src/transport/ElectronRpc.model.js'

it('actual source listener traversal: immutable recipient snapshot, migrated refusal and original later throw', () => {
  const ledger = makeRetentionLedger()
  const account = ledger.forWindow('synthetic')
  const trace = []
  let captured
  const releases = []
  const original = new Error('original source listener failure')
  const event = {
    threadId: 't',
    runId: null,
    messageId: null,
    seq: 1,
    type: 'saved',
    createdAt: 1,
    patch: { messages: [{ id: 'm', text: 'before' }] }
  }
  const migrated = (value) => {
    trace.push('migrated')
    const snapshot = snapshotPublication({ value, account })
    assert(Result.isSuccess(snapshot))
    captured = snapshot.success
  }
  releases.push(subscribeAgentEvents(migrated))
  // The actual source Set deduplicates the same function; no new listener container traverses it.
  releases.push(subscribeAgentEvents(migrated))
  releases.push(
    subscribeAgentEvents((value) => {
      trace.push('mutate')
      value.patch.messages[0].text = 'after'
    })
  )
  releases.push(
    subscribeAgentEvents(() => {
      trace.push('migrated-refusal')
      assert(
        Result.isFailure(
          snapshotPublication({ value: Object.assign([], { forbidden: true }), account })
        )
      )
    })
  )
  releases.push(
    subscribeAgentEvents(() => {
      trace.push('legacy-throw')
      throw original
    })
  )
  releases.push(subscribeAgentEvents(() => trace.push('unreachable')))
  try {
    assert.throws(
      () => publishAgentEvent(event),
      (error) => error === original
    )
    assert.deepEqual(trace, ['migrated', 'mutate', 'migrated-refusal', 'legacy-throw'])
    assert.equal(captured.value.patch.messages[0].text, 'before')
    assert(Object.isFrozen(captured.value.patch.messages[0]))
    assert(ledger.stats().data > 0)
  } finally {
    for (const release of releases) {
      release()
    }
    captured?.release()
  }
  assert.equal(ledger.stats().data, 0)
})

it('source-specific AI hydration overlaps remain B then A while transport repair rejects superseded A', async () => {
  const source = readFileSync(
    new URL('../../src/renderer/src/hooks/use-agent-task-events.ts', import.meta.url),
    'utf8'
  )
  const start = source.indexOf('    const hydrate = async')
  const end = source.indexOf('    /** Load prompt titles', start)
  assert(start >= 0 && end > start)
  const body = source
    .slice(start, end)
    .replace(': Promise<void>', '')
    .replace('new Set<string>()', 'new Set()')
  const make = new Function(
    'ipcServices',
    'setTasks',
    'mergeAgentHistoryActivity',
    'logger',
    `let cancelled=false,touched=null;${body};return {hydrate}`
  )
  const pending = []
  const trace = []
  let state = []
  const consumer = make(
    { ai: { listAgentHistory: () => new Promise((resolve) => pending.push(resolve)) } },
    (update) => {
      state = update(state)
      trace.push(state)
    },
    (_, rows, touched) => rows.filter((row) => !touched.has(row)),
    { error: () => {} }
  )
  const repair = makeRecovery()
  const attemptA = repair.begin('same-epoch')
  const a = consumer.hydrate()
  const attemptB = repair.begin('same-epoch')
  const b = consumer.hydrate()
  pending[1](['new'])
  await b
  pending[0](['old'])
  await a
  assert.deepEqual(trace, [['new'], ['old']])
  assert.equal(repair.accept({ attempt: attemptA, nextEpoch: 'same-epoch' }), false)
  assert.equal(repair.accept({ attempt: attemptB, nextEpoch: 'same-epoch' }), true)
  repair.dispose()
})

it('source-specific downloads Completed/Updated prefixes and overlapping history B then A', async () => {
  const compile = (source) => new Transpiler({ loader: 'ts' }).transformSync(source)
  const hook = readFileSync(
    new URL('../../src/renderer/src/hooks/use-download-events.ts', import.meta.url),
    'utf8'
  )
  const sync = hook
    .slice(hook.indexOf('async (id: string) => {'), hook.indexOf('\n    [addHistoryRecord'))
    .trim()
    .replace(/,$/, '')
  const completed = hook.slice(
    hook.indexOf('const handleCompleted'),
    hook.indexOf('const handleError')
  )
  const updated = hook.slice(
    hook.indexOf('const handleUpdated'),
    hook.indexOf('const queuedSubscription')
  )
  const trace = []
  const pending = []
  const ipcServices = {
    history: {
      getHistoryById(id) {
        trace.push(`read:${id}`)
        return new Promise((resolve) => pending.push(resolve))
      }
    }
  }
  const addHistoryRecord = (x) => trace.push(`history:${x.title}`)
  const removeDownload = (id) => trace.push(`remove:${id}`)
  const syncHistoryItem = new Function(
    'ipcServices',
    'addHistoryRecord',
    'removeDownload',
    'isFinalStatus',
    'logger',
    `${compile(`const sync=${sync}`)};return sync`
  )(ipcServices, addHistoryRecord, removeDownload, (s) => s === 'completed', { error() {} })
  const handlers = new Function(
    'updateDownload',
    'syncHistoryItem',
    'isFinalStatus',
    'enableDownloadNotifications',
    `${compile(completed + updated)};return {handleCompleted,handleUpdated}`
  )(
    (x) => trace.push(`update:${x.id}`),
    syncHistoryItem,
    (s) => s === 'completed',
    false
  )
  handlers.handleCompleted('a')
  trace.push('applied:1')
  handlers.handleUpdated({ id: 'b', updates: { status: 'completed' } })
  trace.push('applied:2')
  assert.deepEqual(trace, ['update:a', 'read:a', 'applied:1', 'update:b', 'read:b', 'applied:2'])
  pending[1]({ id: 'b', title: 'B', status: 'completed' })
  await Promise.resolve()
  await Promise.resolve()
  pending[0]({ id: 'a', title: 'A', status: 'completed' })
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(
    trace.filter((x) => x.startsWith('history:')),
    ['history:B', 'history:A']
  )
  console.log(
    'PASS source-extracted Completed/Updated synchronous watermarks and overlapping history reads B then A'
  )
})
