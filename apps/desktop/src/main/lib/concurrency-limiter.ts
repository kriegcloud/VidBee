/** Runs one queued job; resolves or rejects with the job's own outcome. */
export type Limiter = <T>(job: () => Promise<T>) => Promise<T>

/**
 * A FIFO gate that lets at most `maxConcurrent` jobs run at once. A job that
 * rejects frees its slot exactly like one that resolves, so one bad file can
 * never wedge the queue.
 *
 * @param maxConcurrent Jobs allowed in flight; values below 1 are treated as 1.
 */
export const createLimiter = (maxConcurrent: number): Limiter => {
  const cap = Math.max(1, Math.floor(maxConcurrent))
  const waiting: Array<() => void> = []
  let running = 0

  const release = (): void => {
    running -= 1
    const next = waiting.shift()
    if (next) {
      running += 1
      next()
    }
  }

  const acquire = (): Promise<void> => {
    if (running < cap) {
      running += 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      waiting.push(resolve)
    })
  }

  return async <T>(job: () => Promise<T>): Promise<T> => {
    await acquire()
    try {
      return await job()
    } finally {
      release()
    }
  }
}
