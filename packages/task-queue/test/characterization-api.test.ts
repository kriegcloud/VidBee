import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TaskQueueAPI, type TaskQueueAPIOptions } from '@vidbee/task-queue'
import { virtualError } from '@vidbee/task-queue/classifier'
import type { ExecutorContext, ExecutorEvents, ExecutorFinishEvent } from '@vidbee/task-queue/executor'
import { MemoryPersistAdapter } from '@vidbee/task-queue/persist'
import { SourceAdmission } from '@vidbee/task-queue/source-admission'
import { EMPTY_PROGRESS } from '@vidbee/task-queue/types'
import { deferred, fakeTimers, task, turn } from './fixtures'

const output = { filePath: '/fixture.mp4', size: 10, durationMs: null, sha256: null, formatId: null }
const input = (id: string) => ({ kind: 'video' as const, url: `https://example.com/${id}` })
type Run = { ctx: ExecutorContext; events: ExecutorEvents }
const finished = (run: Run, result: ExecutorFinishEvent['result'] = { type: 'success', output }): ExecutorFinishEvent => ({
  ...run.ctx, result, closedAt: 10, stdoutTail: '', stderrTail: ''
})
function harness(opts: Partial<TaskQueueAPIOptions> = {}) {
  const runs: Run[] = []
  const commands: string[] = []
  const timers = fakeTimers()
  const persist = new MemoryPersistAdapter()
  const queue = new TaskQueueAPI({ persist, ...timers, idleQueueKickMs: 0, clock: () => 1000,
    filePresent: () => true,
    executor: { run(ctx, events) { runs.push({ ctx, events }); return {
      cancel: async (timeout) => { commands.push(`cancel:${ctx.taskId}:${timeout}`) },
      pause: async () => { commands.push(`pause:${ctx.taskId}`) }
    } } }, ...opts })
  return { queue, runs, commands, timers, persist }
}

test('lifecycle: concurrent start returns early; failed start remains latched until stop', async () => {
  const gate = deferred()
  let loads = 0
  const persist = new MemoryPersistAdapter()
  persist.loadAllTasks = async () => { loads++; await gate.promise; throw new Error('load failed') }
  const { queue } = harness({ persist })
  const first = queue.start()
  await queue.start()
  assert.equal(loads, 1)
  gate.resolve()
  await assert.rejects(first, { message: 'load failed' })
  await queue.start()
  assert.equal(loads, 1)
  await queue.stop()
  persist.loadAllTasks = async () => { loads++; return [] }
  await queue.start()
  assert.equal(loads, 2)
  await queue.stop()
})

test('lifecycle: empty restart works; non-empty restart rejects duplicate stored ids', async () => {
  const { queue } = harness()
  await queue.start(); await queue.stop(); await queue.stop(); await queue.start()
  await queue.importCompleted({ id: 'kept', input: input('kept'), output })
  await queue.stop()
  assert.equal(queue.get('kept')?.status, 'completed')
  assert.equal(queue.list().tasks.length, 1)
  assert.equal(queue.stats().byStatus.completed, 1)
  const seen: string[] = []
  const off = queue.subscribe(e => seen.push(e.type))
  const offTyped = queue.on('snapshot-changed', () => seen.push('typed'))
  await queue.rename('kept', 'after stop')
  assert.deepEqual(seen, ['typed', 'snapshot-changed'])
  off(); off(); offTyped(); offTyped()
  await assert.rejects(queue.start(), /duplicate/i)
  await queue.stop()
})

test('lifecycle: stop awaits executor cancellation but not finish; watchdog remains armed', async () => {
  const cancelGate = deferred()
  const closeGate = deferred()
  let closes = 0
  class ClosingPersist extends MemoryPersistAdapter {
    async close() { closes++; await closeGate.promise }
  }
  const persist = new ClosingPersist()
  const { queue, runs, timers } = harness({ persist, idleQueueKickMs: 15_000,
    executor: { run(ctx, events) { runs.push({ ctx, events }); return { pause: async () => {}, cancel: async timeout => { assert.equal(timeout, 0); await cancelGate.promise } } } } })
  await queue.start(); await queue.add({ id: 'a', input: input('a') })
  const run = runs[0]!
  run.events.onSpawn({ ...run.ctx, pid: -1, pidStartedAt: 1, kind: 'yt-dlp', spawnedAt: 1 })
  assert.equal(timers.pending.size, 2)
  const stopping = queue.stop()
  assert.equal(timers.pending.size, 1)
  run.events.onFinish(finished(run))
  await turn()
  assert.equal(queue.get('a')?.status, 'completed')
  cancelGate.resolve(); await turn(); assert.equal(closes, 1)
  closeGate.resolve(); await stopping
  assert.equal(timers.pending.size, 0)
  await queue.stop(); assert.equal(closes, 1)
})

test('lifecycle: late finish after stop finalizes; absent finish leaves watchdog armed', async () => {
  const { queue, runs, timers } = harness()
  await queue.start(); await queue.add({ id: 'a', input: input('a') })
  const run = runs[0]!
  run.events.onSpawn({ ...run.ctx, pid: -1, pidStartedAt: 1, kind: 'yt-dlp', spawnedAt: 1 })
  await queue.stop()
  assert.equal(queue.get('a')?.status, 'running')
  assert.equal(timers.pending.size, 1)
  run.events.onFinish(finished(run))
  await turn()
  assert.equal(queue.get('a')?.status, 'completed')
  assert.equal(timers.pending.size, 0)
})

for (const replace of [false, true]) {
  test(`rollback: transition/rename identity guard, replacement=${replace}`, async () => {
    const persist = new MemoryPersistAdapter()
    const { queue } = harness({ persist })
    await queue.importCompleted({ id: 'done', input: input('done'), output })
    const original = queue.get('done')
    const gate = deferred()
    const failure = new Error('write rejected')
    let reject!: (e: Error) => void
    persist.upsertTask = () => new Promise((_, no) => { reject = no; gate.resolve() })
    const pending = queue.rename('done', 'first'); await gate.promise
    if (replace) { persist.upsertTask = async () => {}; await queue.rename('done', 'replacement') }
    reject(failure)
    await assert.rejects(pending, e => e === failure)
    assert.equal(queue.get('done')?.input.title, replace ? 'replacement' : undefined)
    if (!replace) assert.equal(queue.get('done'), original)

    // A queued task blocked by a full slot allows pause to exercise applyTransition.
    const h = harness(); await h.queue.start()
    await h.queue.setMaxConcurrency(1)
    await h.queue.add({ id: 'blocker', input: input('blocker') })
    await h.queue.add({ id: 'queued', input: input('queued') })
    const before = h.queue.get('queued')
    const transitionGate = deferred()
    h.persist.upsertTask = () => new Promise((_, no) => { reject = no; transitionGate.resolve() })
    const pausing = h.queue.pause('queued'); await transitionGate.promise
    assert.equal(h.queue.get('queued')?.status, 'paused')
    if (replace) { h.persist.upsertTask = async () => {}; await h.queue.rename('queued', 'replacement') }
    reject(failure); await assert.rejects(pausing, e => e === failure)
    assert.equal(h.queue.get('queued')?.status, replace ? 'paused' : 'queued')
    if (!replace) assert.equal(h.queue.get('queued'), before)
    await h.queue.stop()
  })

  for (const operation of ['add', 'importCompleted'] as const) {
    test(`rollback: ${operation} removes unconditionally, replacement=${replace}`, async () => {
      const { queue, persist } = harness()
      let reject!: (e: Error) => void
      persist.insertTask = () => new Promise((_, no) => { reject = no })
      const request = { id: 'a', input: input('a'), output }
      const pending = operation === 'add' ? queue.add(request) : queue.importCompleted(request)
      assert.ok(queue.get('a'))
      if (replace) await queue.rename('a', 'replacement')
      reject(new Error('insert rejected'))
      await assert.rejects(pending, /insert rejected/)
      assert.equal(queue.get('a'), undefined)
    })
  }

  test(`rollback: relocate identity guard and history deletion, replacement=${replace}`, async () => {
    const { queue, persist } = harness()
    await queue.importCompleted({ id: 'a', input: input('a'), output })
    let reject!: (e: Error) => void
    persist.upsertTasks = () => new Promise((_, no) => { reject = no })
    const moving = queue.relocateFileReferences('/fixture.mp4', '/moved.mp4')
    assert.equal(queue.get('a')?.output?.filePath, '/moved.mp4')
    if (replace) await queue.rename('a', 'replacement')
    reject(new Error('move rejected')); await assert.rejects(moving, /move rejected/)
    assert.equal(queue.get('a')?.output?.filePath, replace ? '/moved.mp4' : '/fixture.mp4')
    const saved = queue.get('a')
    const deleting = deferred()
    persist.deleteTask = () => new Promise((_, no) => { reject = no; deleting.resolve() })
    const removing = queue.removeFromHistory('a'); await deleting.promise
    if (replace) await queue.rename('a', 'delete replacement')
    reject(new Error('delete rejected'))
    await assert.rejects(removing, /delete rejected/)
    if (replace) assert.equal(queue.get('a')?.input.title, 'delete replacement')
    else assert.equal(queue.get('a'), saved)
  })
}

test('event delivery is typed then wildcard, live registration/removal, throw isolation and idempotent unsubscribe', async () => {
  const { queue } = harness()
  const seen: string[] = []
  queue.subscribe(() => seen.push('wild-1'))
  let remove = () => {}
  queue.on('snapshot-changed', () => { seen.push('typed-1'); remove(); queue.on('snapshot-changed', () => seen.push('added')) })
  remove = queue.on('snapshot-changed', () => seen.push('removed'))
  queue.on('snapshot-changed', () => { seen.push('throws'); throw new Error('listener fixture') })
  queue.on('snapshot-changed', () => seen.push('typed-3'))
  const off = queue.subscribe(() => seen.push('unsubscribed')); off(); off()
  // The bus ignores returned promises. Attach the rejection handler ourselves so
  // node:test does not treat the intentionally rejected value as an unhandled error.
  const rejected = Promise.reject(new Error('listener rejection')); rejected.catch(() => {})
  queue.on('snapshot-changed', () => { seen.push('promise'); return rejected })
  queue.subscribe(() => seen.push('wild-2'))
  await queue.importCompleted({ id: 'a', input: input('a'), output })
  assert.deepEqual(seen, ['typed-1', 'throws', 'typed-3', 'promise', 'added', 'wild-1', 'wild-2'])
})

for (const [first, second] of [
  ['https://WWW.YOUTUBE.COM/x', 'https://youtu.be/y'],
  ['https://m.youtube.com/x', 'https://youtube.com/y'],
  ['https://threads.net/x', 'https://www.threads.com/y'],
  ['https://m.instagram.com/x', 'https://instagram.com/y'],
  ['https://a.tiktok.com/x', 'https://tiktok.com/y'],
  ['https://a.facebook.com/x', 'https://facebook.com/y'],
  ['https://a.vsco.co/x', 'https://vsco.co/y'],
  ['https://a.dzen.ru/x', 'https://dzen.ru/y'],
  ['https://WWW.EXAMPLE.COM:42/x', 'http://example.com:80/y']
]) test(`admission normalizes ${first} to ${second}`, () => {
  const admission = new SourceAdmission(); const release = admission.tryAcquire(first!)
  assert.ok(release); assert.equal(admission.tryAcquire(second!), null); release(); release()
  assert.ok(admission.tryAcquire(second!))
})

test('admission grants waiter before subscriber; abort removes waiter; invalid URL never holds permit', async () => {
  const admission = new SourceAdmission()
  const release = admission.tryAcquire('https://example.com/a')!
  const aborted = new AbortController()
  const first = admission.acquire('https://example.com/b', aborted.signal)
  const second = admission.acquire('https://example.com/c')
  aborted.abort(); assert.equal(await first, null)
  let notified = 0
  const off = admission.subscribe(() => { notified++; assert.equal(admission.tryAcquire('https://example.com/d'), null) })
  release(); release(); assert.equal(notified, 1)
  const granted = await second; assert.ok(granted); off(); off(); granted()
  assert.ok(admission.tryAcquire('https://example.com/e'))
  for (let i = 0; i < 2; i++) assert.ok(admission.tryAcquire('invalid URL'))
  const already = new AbortController(); already.abort()
  assert.equal(await admission.acquire('invalid URL', already.signal), null)
  const invalid = await admission.acquire('invalid URL'); assert.ok(invalid); invalid()
  const unrelated = new SourceAdmission()
  assert.ok(unrelated.tryAcquire('https://a.example.com'))
  assert.ok(unrelated.tryAcquire('https://b.example.com'))
})

for (const result of ['success', 'retry', 'cancel'] as const) {
  test(`events: complete ${result} life has exact ordering`, async () => {
    const { queue, runs } = harness({ rng: () => 0.5 })
    const seen: string[] = []
    queue.subscribe(e => seen.push(e.type === 'transition' ? `${e.type}:${e.from}->${e.to}` : e.type))
    await queue.start(); await queue.add({ id: 'a', input: input('a') })
    const run = runs[0]!
    run.events.onProgress({ ...run.ctx, progress: { ...EMPTY_PROGRESS, ticks: 1 }, enteredProcessing: false })
    run.events.onProcessing?.(run.ctx); await turn()
    if (result === 'cancel') await queue.cancel('a')
    run.events.onFinish(finished(run, result === 'retry'
      ? { type: 'error', error: virtualError('network-transient', 'network fixture'), exitCode: 1 }
      : result === 'cancel' ? { type: 'cancelled' } : { type: 'success', output }))
    await turn()
    assert.deepEqual(seen, [
      'transition:null->queued', 'snapshot-changed', 'transition:queued->running', 'snapshot-changed',
      'progress', 'transition:running->processing', 'snapshot-changed',
      ...(result === 'retry' ? ['error-classified', 'transition:processing->retry-scheduled']
        : [`transition:processing->${result === 'cancel' ? 'cancelled' : 'completed'}`]), 'snapshot-changed'
    ])
    await queue.stop()
  })
}

test('scheduler public API: priority/FIFO, global cap and shrink choose first lowest priority', async () => {
  const { queue, runs, commands } = harness({ maxConcurrency: 1 })
  await queue.start()
  await queue.add({ id: 'blocker', input: input('blocker') })
  for (const [id, priority] of [['background', 20], ['user-a', 0], ['subscription', 10], ['user-b', 0]] as const)
    await queue.add({ id, priority, input: input(id) })
  assert.equal(queue.stats().running, 1)
  runs[0]!.events.onFinish(finished(runs[0]!)); await turn()
  assert.deepEqual(runs.map(r => r.ctx.taskId), ['blocker', 'user-a'])
  await queue.setMaxConcurrency(4); await turn()
  assert.deepEqual(runs.map(r => r.ctx.taskId), ['blocker', 'user-a', 'user-b', 'subscription', 'background'])
  await queue.setMaxConcurrency(2)
  assert.deepEqual(commands, ['pause:background', 'pause:subscription'])
  assert.equal(queue.stats().running, 2)
  await queue.stop()
})

test('scheduler public API: group null removes override and restores default; independent groups fill global cap', async () => {
  const { queue, runs } = harness({ maxConcurrency: 4, defaultMaxPerGroup: 1 })
  await queue.start()
  await queue.add({ id: 'a', input: input('a'), groupKey: 'shared' })
  await queue.add({ id: 'b', input: input('b'), groupKey: 'shared' })
  await queue.add({ id: 'other', input: input('other'), groupKey: 'other' })
  assert.deepEqual(runs.map(r => r.ctx.taskId), ['a', 'other'])
  await queue.setMaxPerGroup('shared', 2); await turn()
  assert.deepEqual(runs.map(r => r.ctx.taskId), ['a', 'other', 'b'])
  await queue.setMaxPerGroup('shared', null); await turn()
  await queue.add({ id: 'c', input: input('c'), groupKey: 'shared' })
  assert.equal(queue.get('c')?.status, 'queued')
  runs[0]!.events.onFinish(finished(runs[0]!)); await turn()
  assert.equal(queue.get('c')?.status, 'queued')
  runs[2]!.events.onFinish(finished(runs[2]!)); await turn()
  assert.equal(queue.get('c')?.status, 'running')
  await queue.stop()
})

test('scheduler public API: download cap defers transcription only until download count drops', async () => {
  const { queue, runs } = harness({ maxConcurrency: 3 })
  await queue.start(); await queue.setMaxConcurrentDownloads(1)
  await queue.add({ id: 'download', input: input('download') })
  await queue.add({ id: 'asr', input: { kind: 'transcription', url: 'file:///fixture.wav' } })
  await queue.add({ id: 'conversion', input: { kind: 'conversion', url: 'file:///fixture.mp4' } })
  assert.deepEqual(runs.map(r => r.ctx.taskId), ['download', 'conversion'])
  runs[0]!.events.onFinish(finished(runs[0]!)); await turn()
  assert.equal(queue.get('asr')?.status, 'running')
  await queue.stop()
})

for (const rng of [0, 0.5, 0.999999]) test(`retry budget uses maximum and injected jitter ${rng}`, async () => {
  let now = 1000
  const { queue, runs, timers } = harness({ rng: () => rng, clock: () => now })
  await queue.start(); await queue.add({ id: 'retry', maxAttempts: 1, input: input('retry') })
  for (let attempt = 1; attempt <= 5; attempt++) {
    const run = runs[attempt - 1]!
    run.events.onFinish(finished(run, { type: 'error', error: virtualError('network-transient', 'fixture'), exitCode: 1 }))
    await turn()
    if (attempt === 5) { assert.equal(queue.get('retry')?.status, 'failed'); break }
    const delay = Math.floor(rng * Math.min(60000, 2000 * 2 ** attempt))
    assert.equal(queue.get('retry')?.nextRetryAt, now + delay)
    assert.equal([...timers.pending.values()][0]?.ms, delay)
    now += delay; timers.fire(); await turn()
    assert.equal(queue.get('retry')?.attempt, attempt + 1)
  }
  await queue.stop()
})

test('retry budget honors larger task maximum and suggested delay without jitter', async () => {
  let now = 1000
  const { queue, runs, timers } = harness({ clock: () => now, rng: () => { throw new Error('jitter must be skipped') } })
  await queue.start(); await queue.add({ id: 'retry', maxAttempts: 7, input: input('retry') })
  for (let attempt = 1; attempt <= 7; attempt++) {
    const run = runs[attempt - 1]!
    run.events.onFinish(finished(run, { type: 'error', error: { ...virtualError('network-transient', 'fixture'), suggestedRetryAfterMs: 70000 }, exitCode: 1 }))
    await turn()
    if (attempt === 7) { assert.equal(queue.get('retry')?.status, 'failed'); break }
    assert.equal(queue.get('retry')?.nextRetryAt, now + 70000)
    assert.equal([...timers.pending.values()][0]?.ms, 70000)
    now += 70000; timers.fire(); await turn()
  }
  await queue.stop()
})

test('watchdog stall retries only after executor finish; idle interval rearms and stop clears idle', async () => {
  let now = 1000
  const { queue, runs, timers, commands } = harness({ clock: () => now, runningIdleMs: 25, idleQueueKickMs: 15 })
  await queue.start(); await queue.add({ id: 'a', input: input('a') })
  const run = runs[0]!
  run.events.onSpawn({ ...run.ctx, pid: -1, pidStartedAt: 1, kind: 'yt-dlp', spawnedAt: now })
  assert.deepEqual([...timers.pending.values()].map(t => t.ms), [15, 25])
  timers.fire(); await turn()
  assert.deepEqual([...timers.pending.values()].map(t => t.ms), [25, 15])
  now += 25; timers.fire()
  assert.deepEqual(commands, ['cancel:a:0'])
  assert.equal(queue.get('a')?.status, 'running')
  run.events.onFinish(finished(run, { type: 'cancelled' })); await turn()
  assert.equal(queue.get('a')?.status, 'retry-scheduled')
  assert.equal(queue.get('a')?.lastError?.category, 'stalled')
  await queue.stop(); assert.equal(timers.pending.size, 0)
})

test('zombie grace protects a dispatch awaiting attempt insertion until its exact boundary', async () => {
  let now = 1000
  const gate = deferred()
  const { queue, persist } = harness({ clock: () => now, zombieRunningMs: 80 })
  persist.insertAttempt = async () => { await gate.promise }
  await queue.start()
  const adding = queue.add({ id: 'a', input: input('a') })
  await turn(); assert.equal(queue.get('a')?.status, 'running')
  const changes: string[] = []
  queue.on('transition', e => changes.push(e.to))
  now = 1079; await queue.reconcileQueue(); assert.deepEqual(changes, [])
  now = 1080; await queue.reconcileQueue()
  assert.deepEqual(changes, ['paused', 'queued'])
  gate.resolve(); await adding; await queue.stop()
})

test('scheduler shrink ties demote first reserved task at the lowest priority, regardless of progress', async () => {
  const { queue, runs, commands } = harness({ maxConcurrency: 3 })
  await queue.start()
  for (const id of ['old-low', 'new-low']) await queue.add({ id, priority: 20, input: input(id) })
  await queue.add({ id: 'user', priority: 0, input: input('user') })
  runs[0]!.events.onProgress({ ...runs[0]!.ctx, progress: { ...EMPTY_PROGRESS, percent: 0.99 }, enteredProcessing: false })
  await queue.setMaxConcurrency(2)
  assert.deepEqual(commands, ['pause:old-low'])
  await queue.stop()
})

test('public retry backoff reaches 60-second cap with large attempt budget', async () => {
  let now = 1000
  const { queue, runs, timers } = harness({ clock: () => now, rng: () => 0.999999 })
  await queue.start(); await queue.add({ id: 'a', maxAttempts: 7, input: input('a') })
  for (let attempt = 1; attempt <= 7; attempt++) {
    const run = runs[attempt - 1]!
    run.events.onFinish(finished(run, { type: 'error', error: virtualError('network-transient', 'fixture'), exitCode: 1 }))
    await turn()
    if (attempt === 7) { assert.equal(queue.get('a')?.status, 'failed'); break }
    const delay = Math.floor(0.999999 * Math.min(60000, 2000 * 2 ** attempt))
    assert.equal([...timers.pending.values()][0]?.ms, delay)
    assert.equal(queue.get('a')?.nextRetryAt, now + delay)
    if (attempt >= 5) assert.equal(delay, 59999)
    now += delay; timers.fire(); await turn()
  }
  await queue.stop()
})
