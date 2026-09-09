import type { Task } from '../src/types'
import { EMPTY_PROGRESS } from '../src/types'

export const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  kind: 'video',
  parentId: null,
  input: { kind: 'video', url: 'https://example.com/video' },
  priority: 0,
  groupKey: 'example.com',
  status: 'completed',
  prevStatus: 'running',
  statusReason: null,
  enteredStatusAt: 1,
  attempt: 1,
  maxAttempts: 5,
  nextRetryAt: null,
  progress: { ...EMPTY_PROGRESS },
  output: null,
  lastError: null,
  pid: null,
  pidStartedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...overrides
})

export const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

export const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

export const fakeTimers = () => {
  let sequence = 0
  let created = 0
  const pending = new Map<number, { fn: () => void; ms: number }>()
  return {
    pending,
    get created() {
      return created
    },
    setTimer(fn: () => void, ms: number) {
      const id = sequence++
      created++
      pending.set(id, { fn, ms })
      return id
    },
    clearTimer(handle: unknown) {
      pending.delete(handle as number)
    },
    fire() {
      const item = pending.entries().next().value
      if (!item) {
        throw new Error('No pending timer')
      }
      pending.delete(item[0])
      item[1].fn()
    }
  }
}
