/**
 * Routes a task attempt to the executor registered for its kind.
 *
 * The kernel stays kind-agnostic: download and transcription logic live in
 * host-supplied executors. Unknown kinds fall back to `defaultExecutor`.
 */
import type { TaskKind } from '../types'
import type { Executor, ExecutorContext, ExecutorEvents, ExecutorRun } from './index'

export interface ExecutorRouterOptions {
  defaultExecutor: Executor
  byKind?: Partial<Record<TaskKind, Executor>>
}

export class ExecutorRouter implements Executor {
  private readonly defaultExecutor: Executor
  private readonly byKind: Partial<Record<TaskKind, Executor>>

  constructor(opts: ExecutorRouterOptions) {
    this.defaultExecutor = opts.defaultExecutor
    this.byKind = opts.byKind ?? {}
  }

  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun {
    const executor = this.byKind[ctx.input.kind] ?? this.defaultExecutor
    return executor.run(ctx, events)
  }
}
