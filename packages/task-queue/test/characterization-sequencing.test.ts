import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { TaskQueueAPI } from '@vidbee/task-queue'
import { virtualError } from '@vidbee/task-queue/classifier'
import type { ExecutorContext, ExecutorEvents, ExecutorFinishEvent } from '@vidbee/task-queue/executor'
import { MemoryPersistAdapter } from '@vidbee/task-queue/persist'
import type { JournalAppendInput, PersistTransitionInput, RecordCloseInput, RecordSpawnInput } from '@vidbee/task-queue/persist'
import type { Task, TaskProgress } from '@vidbee/task-queue/types'
import { fakeTimers, turn } from './fixtures'

// These traces are measured on the unchanged pre-port kernel. Every entry includes
// public store visibility; observer .then callbacks never replace adapter promises.
const expected: Record<string, string[]> = JSON.parse(readFileSync(new URL('./fixtures/legacy-sequences.json', import.meta.url), 'utf8'))
const input = (id: string) => ({ kind: 'video' as const, url: `https://example.com/${id}` })
const output = { filePath: '/fixture.mp4', size: 1, durationMs: null, sha256: null, formatId: null }
type Run = { ctx: ExecutorContext; events: ExecutorEvents }
const result = (run: Run, retry = false): ExecutorFinishEvent => ({ ...run.ctx, closedAt: 1000, stdoutTail: '', stderrTail: '', result: retry
  ? { type: 'error', error: virtualError('network-transient', 'fixture'), exitCode: 1 }
  : { type: 'success', output } })

async function trace(scenario: string): Promise<string[]> {
  let recording = false
  const log: string[] = []
  let queue: TaskQueueAPI
  const mark = (label: string) => { if (recording) log.push(`${label}|${['a', 'b'].map(id => {
    const t = queue.get(id); return `${id}:${t?.status ?? '-'}:${t?.pid ?? '-'}`
  }).join(',')}|slots:${queue.stats().running}`) }
  class RecordingPersist extends MemoryPersistAdapter {
    observe<T>(name: string, work: () => Promise<T>): Promise<T> {
      mark(`${name}:start`)
      const promise = work()
      void promise.then(() => mark(`${name}:settled`))
      return promise
    }
    override hasTask(id: string) { return this.observe('hasTask', () => super.hasTask(id)) }
    override insertTask(t: Task) { return this.observe(`insert:${t.id}`, () => super.insertTask(t)) }
    override upsertTask(v: PersistTransitionInput) { return this.observe(`upsert:${v.task.id}:${v.task.status}`, () => super.upsertTask(v)) }
    override insertAttempt(v: RecordSpawnInput) { return this.observe('attempt', () => super.insertAttempt(v)) }
    override appendJournal(v: JournalAppendInput) { return this.observe(`journal:${v.op}`, () => super.appendJournal(v)) }
    override closeAttempt(v: RecordCloseInput) { return this.observe('close', () => super.closeAttempt(v)) }
    override upsertProgress(id: string, p: TaskProgress) { return this.observe('progress', () => super.upsertProgress(id, p)) }
  }
  const runs: Run[] = []
  queue = new TaskQueueAPI({ persist: new RecordingPersist(), ...fakeTimers(), idleQueueKickMs: 0, clock: () => 1000, rng: () => 0.5,
    maxConcurrency: 1, filePresent: () => true,
    executor: { run(ctx, events) {
      const run = { ctx, events }; runs.push(run); mark(`run:${ctx.taskId}`)
      if (scenario === 'sync-finish') events.onFinish(result(run))
      return { cancel: async () => { mark('executor:cancel') }, pause: async () => { mark('executor:pause') } }
    } } })
  queue.subscribe(e => mark(e.type === 'transition' ? `event:transition:${e.to}` : `event:${e.type}`))
  await queue.start()
  if (!['add', 'concurrent-add', 'sync-finish', 'hasTask'].includes(scenario)) await queue.add({ id: 'a', input: input('a') })
  if (['pause-queued', 'cancel-queued', 'slot-release'].includes(scenario)) await queue.add({ id: 'b', input: input('b') })
  recording = true
  let promise: Promise<unknown> | undefined
  if (scenario === 'hasTask') promise = queue.hasTask('a')
  if (scenario === 'add' || scenario === 'sync-finish') promise = queue.add({ id: 'a', input: input('a') })
  if (scenario === 'concurrent-add') {
    promise = queue.add({ id: 'a', input: input('a') })
    void queue.add({ id: 'b', input: input('a') }).then(v => { assert.equal(v.id, 'a'); mark('duplicate:public-settled') })
  }
  if (scenario.startsWith('pause')) promise = queue.pause(scenario === 'pause-queued' ? 'b' : 'a')
  if (scenario.startsWith('cancel')) promise = queue.cancel(scenario === 'cancel-queued' ? 'b' : 'a')
  if (['finish-success', 'finish-retry', 'slot-release'].includes(scenario)) runs[0]!.events.onFinish(result(runs[0]!, scenario === 'finish-retry'))
  if (scenario === 'spawn') runs[0]!.events.onSpawn({ ...runs[0]!.ctx, pid: -2, pidStartedAt: 1, kind: 'yt-dlp', spawnedAt: 1000 })
  mark('return')
  void promise?.then(() => mark('public:settled'))
  queueMicrotask(() => { mark('microtask:1'); queueMicrotask(() => { mark('microtask:2'); queueMicrotask(() => mark('microtask:3')) }) })
  await promise
  await turn()
  mark('drained')
  recording = false
  await queue.stop()
  return log
}

for (const scenario of ['hasTask', 'add', 'concurrent-add', 'pause-running', 'pause-queued', 'cancel-running', 'cancel-queued', 'finish-success', 'finish-retry', 'sync-finish', 'spawn', 'slot-release']) {
  test(`sequencing: ${scenario} exact persistence/events/store/three-microtask/public settlement trace`, async () => {
    assert.deepEqual(await trace(scenario), expected[scenario])
  })
}
