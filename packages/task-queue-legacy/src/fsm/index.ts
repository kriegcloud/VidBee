import * as Result from 'effect/Result'
import { transition as transitionKernel, isLegalTransition } from '@vidbee/task-queue/fsm'
import type { TransitionContext as KernelContext, TransitionTrigger } from '@vidbee/task-queue/Classifier.model'
import type { Task, TaskStatus } from '../types.js'
export { isLegalTransition }
export type { TransitionTrigger }
export interface TransitionContext extends Omit<KernelContext, 'now'> { now?: number }
export class IllegalTransitionError extends Error {
  readonly from: TaskStatus
  readonly to: TaskStatus
  readonly reason: string | undefined
  constructor(from: TaskStatus, to: TaskStatus, reason?: string) {
    super(`IllegalTransition: ${from} -> ${to}${reason ? ` (${reason})` : ''}`)
    this.name = 'IllegalTransitionError'
    this.from = from
    this.to = to
    this.reason = reason
  }
}
export function transition(task: Readonly<Task>, to: TaskStatus, ctx: TransitionContext): Task {
  const result = transitionKernel(task, to, { ...ctx, now: ctx.now ?? Date.now() })
  if (Result.isFailure(result)) throw new IllegalTransitionError(result.failure.from, result.failure.to, result.failure.reason)
  return result.success
}
