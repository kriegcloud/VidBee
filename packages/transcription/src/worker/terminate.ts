import type { ChildProcess } from 'node:child_process'

/** Reap a worker before releasing its task slot, even when SIGTERM is ignored. */
export const terminateWorker = (child: ChildProcess, graceMs = 1000): Promise<void> =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      // child.killed only means a signal was sent; it does not mean it exited.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
    }, graceMs)
    timer.unref()
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    child.stdin?.end()
    child.kill('SIGTERM')
  })
