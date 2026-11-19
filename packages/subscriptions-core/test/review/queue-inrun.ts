import { MemoryPersistAdapter, TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { virtualError } from '@vidbee/task-queue-legacy/classifier'
import type { ExecutorContext, ExecutorEvents } from '@vidbee/task-queue-legacy/executor'

export const operationSets = [[], ['pause'], ['cancel'], ['pause', 'pause'], ['cancel', 'cancel'], ['pause', 'cancel'], ['cancel', 'pause']] as const
export const followups = ['none', 'resume', 'retryManual', 'tick'] as const
export type Followup = typeof followups[number]
const drain = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve()
  await new Promise<void>(resolve => setImmediate(resolve))
}

export async function inRun(operations: readonly ('pause' | 'cancel')[], followup: Followup, synchronousFinish = false) {
  const trace: string[] = []
  const controls: Promise<void>[] = []
  const timers: Array<() => void> = []
  const runs: Array<{ ctx: ExecutorContext; events: ExecutorEvents }> = []
  let now = 1000
  let queue: TaskQueueAPI
  const finish = (index: number) => {
    const run = runs[index]!
    run.events.onFinish({ ...run.ctx, closedAt: now, stdoutTail: '', stderrTail: '', result:
      index === 0 && (followup === 'retryManual' || followup === 'tick')
        ? { type: 'error', error: virtualError('network-transient', 'fixture'), exitCode: 1 }
        : { type: 'success', output: { filePath: '/fixture', size: 1, durationMs: null, sha256: null } } })
  }
  queue = new TaskQueueAPI({ persist: new MemoryPersistAdapter(), idleQueueKickMs: 0,
    clock: () => now, rng: () => 0.5, filePresent: () => true,
    setTimer: fn => { timers.push(fn); return fn }, clearTimer: () => {},
    executor: { run(ctx, events) {
      const index = runs.length
      runs.push({ ctx, events }); trace.push(`run${index}.start`)
      if (index === 0) for (const operation of operations) controls.push(queue[operation]('T'))
      if (synchronousFinish) finish(index)
      return { cancel: async () => { trace.push(`run${index}.cancel`) }, pause: async () => { trace.push(`run${index}.pause`) } }
    } } })
  queue.subscribe(event => { if (event.type === 'transition') trace.push(`${event.from}->${event.to}(${event.reason})`) })
  await queue.start()
  try {
    await queue.add({ id: 'T', input: { kind: 'video', url: 'https://example.com/T' } })
    await Promise.all(controls)
    if (!synchronousFinish) finish(0)
    await drain()
    const mid = queue.get('T')?.status
    if (followup === 'resume') await queue.resume('T')
    if (followup === 'retryManual') await queue.retryManual('T')
    if (followup === 'tick') { now = 100000000; timers.at(-1)?.() }
    await drain()
    if (!synchronousFinish && runs.length > 1) finish(1)
    await drain()
    return { mid, final: queue.get('T')?.status, running: queue.stats().running, runs: runs.length, trace: [...trace] }
  } finally { await queue.stop() }
}
