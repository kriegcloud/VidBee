import { spawn } from 'node:child_process'

/** Bounded process capture: exit is not completion while descendants hold pipes. */
export function capture(cmd, argv, { timeoutMs = 120_000, ...options } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, {
      ...options,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const stdout = []
    const stderr = []
    let failure
    let settled = false
    const kill = () => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        /* owned group already ended */
      }
    }
    const finish = (error, value) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve(value)
      }
    }
    const timer = setTimeout(() => {
      kill()
      child.stdout.destroy()
      child.stderr.destroy()
      finish(
        Object.assign(new Error(`Process capture timed out after ${timeoutMs}ms: ${cmd}`), {
          code: child.exitCode,
          signal: child.signalCode
        })
      )
    }, timeoutMs)
    const failed = (error) => {
      failure ??= error
      kill()
    }
    child.on('error', (error) => {
      failed(error)
      finish(error)
    })
    child.stdout.on('error', failed)
    child.stderr.on('error', failed)
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.once('close', (code, signal) =>
      finish(failure, {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString()
      })
    )
  })
}
