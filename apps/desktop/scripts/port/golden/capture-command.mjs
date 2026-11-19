import { spawn } from 'node:child_process'

/** Collect through stream closure and child close; exit alone does not drain pipes. */
export function captureCommand(cmd, argv, options = {}, spawnChild = spawn) {
  const { timeoutMs = 180_000, maxBytes = 256 * 1024 * 1024, ...spawnOptions } = options
  return new Promise((resolve, reject) => {
    const child = spawnChild(cmd, argv, { ...spawnOptions, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    let bytes = 0
    let settled = false
    const finish = (error, result) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
        }
        child.stdout.destroy()
        child.stderr.destroy()
        reject(error)
      } else {
        resolve(result)
      }
    }
    const timer = setTimeout(
      () => finish(new Error(`command capture timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
    const collect = (chunks) => (data) => {
      if (settled) {
        return
      }
      bytes += data.byteLength
      if (bytes > maxBytes) {
        finish(new Error(`command capture exceeded ${maxBytes} bytes`))
      } else {
        chunks.push(data)
      }
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.stdout.on('error', (error) => finish(error))
    child.stderr.on('error', (error) => finish(error))
    child.on('error', (error) => finish(error))
    child.on('close', (code, signal) =>
      finish(undefined, {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      })
    )
  })
}
