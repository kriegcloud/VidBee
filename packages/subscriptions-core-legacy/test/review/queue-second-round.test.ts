import { expect, it } from '@effect/vitest'
import { MemoryPersistAdapter, TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { virtualError } from '@vidbee/task-queue-legacy/classifier'
import type { ExecutorContext, ExecutorEvents, ExecutorFinishEvent } from '@vidbee/task-queue-legacy/executor'

const deferred = () => {
  let resolve = () => {}
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 1000 && !predicate(); i++) await Promise.resolve()
  expect(predicate()).toBe(true)
}
for (const operation of ['cancel', 'pause'] as const) {
  for (const automatic of operation === 'pause' ? [false, true] : [false]) {
    it(`R1/R2/R6/R7: ${operation} during closeAttempt does not reach ${automatic ? 'automatic' : 'manual'} retry`, async () => {
      const persist = new MemoryPersistAdapter()
      const entered = deferred(), gate = deferred()
      const close = persist.closeAttempt.bind(persist)
      persist.closeAttempt = async input => { entered.resolve(); await gate.promise; await close(input) }
      const runs: Array<{ ctx: ExecutorContext; events: ExecutorEvents; controls: string[] }> = []
      const timers: Array<() => void> = []
      let now = 1000
      const queue = new TaskQueueAPI({ persist, idleQueueKickMs: 0, filePresent: () => true,
        clock: () => now, setTimer: fn => { timers.push(fn); return fn }, clearTimer: () => {},
        executor: { run(ctx, events) { const controls: string[] = []; runs.push({ ctx, events, controls }); return {
          cancel: async () => { controls.push('cancel') }, pause: async () => { controls.push('pause') }
        } } } })
      await queue.start()
      try {
        await queue.add({ id: 'a', input: { kind: 'video', url: 'https://example.com/a' } })
        const first = runs[0]!
        const result: ExecutorFinishEvent['result'] = operation === 'cancel' ? { type: 'success', output: { filePath: '/fixture', size: 1, durationMs: null, sha256: null } } :
          { type: 'error', error: { ...virtualError(automatic ? 'http-429' : 'unknown', 'failure'), retryable: automatic, suggestedRetryAfterMs: 10 }, exitCode: 1 }
        first.events.onFinish({ ...first.ctx, result, closedAt: now, stdoutTail: '', stderrTail: '' })
        await entered.promise
        await queue[operation]('a')
        if (operation === 'cancel') expect(queue.stats().running).toBe(0)
        gate.resolve()
        await until(() => queue.get('a')?.status === (operation === 'cancel' ? 'cancelled' : automatic ? 'retry-scheduled' : 'failed'))
        if (automatic) { await until(() => timers.length > 0); await new Promise<void>(resolve => setImmediate(resolve)); now += 20; timers.at(-1)!() } else await queue.retryManual('a')
        await until(() => runs.length === 2)
        expect(runs[1]!.controls).toEqual([])
        expect(queue.get('a')?.status).toBe('running')
      } finally { gate.resolve(); await queue.stop() }
    })
  }
  it(`R3: ${operation} in insertAttempt preserves the old dropped-control window`, async () => {
    const persist = new MemoryPersistAdapter()
    const entered = deferred(), gate = deferred(), controlGate = deferred()
    const insert = persist.insertAttempt.bind(persist)
    persist.insertAttempt = async input => { entered.resolve(); await gate.promise; await insert(input) }
    const controls: string[] = []
    let runs = 0
    const queue = new TaskQueueAPI({ persist, idleQueueKickMs: 0, executor: { run() { runs++; return {
      cancel: async () => { controls.push('cancel'); await controlGate.promise },
      pause: async () => { controls.push('pause'); await controlGate.promise }
    } } } })
    await queue.start()
    try {
      let settled = false
      const added = queue.add({ id: 'a', input: { kind: 'video', url: 'https://example.com/a' } }).then(() => { settled = true })
      await entered.promise
      await queue[operation]('a')
      expect(queue.stats().running).toBe(operation === 'cancel' ? 0 : 1)
      gate.resolve()
      await until(() => settled)
      await added
      expect(runs).toBe(1)
      expect(controls).toEqual([])
      expect(queue.get('a')?.status).toBe(operation === 'cancel' ? 'cancelled' : 'running')
    } finally { gate.resolve(); controlGate.resolve(); await queue.stop() }
  })
}

it('R4: concurrent stops both await cancellation and close; start during stop remains a no-op', async () => {
  const persist = new MemoryPersistAdapter()
  const gate = deferred()
  let cancels = 0, closes = 0, stopped = 0
  persist.close = () => { closes++ }
  const queue = new TaskQueueAPI({ persist, idleQueueKickMs: 0, executor: { run: () => ({
    cancel: async () => { cancels++; await gate.promise }, pause: async () => {}
  }) } })
  await queue.start()
  await queue.add({ id: 'a', input: { kind: 'video', url: 'https://example.com/a' } })
  const first = queue.stop().then(() => { stopped++ })
  const second = queue.stop().then(() => { stopped++ })
  await until(() => cancels === 2)
  await queue.start()
  expect(stopped).toBe(0)
  expect(closes).toBe(0)
  gate.resolve()
  await Promise.all([first, second])
  expect(closes).toBe(2)
})
