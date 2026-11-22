import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { containedLaunch } from './containment.mjs'
export function launchOwned(work, command, inputs = [], options = {}) {
  const child = spawn('bwrap', containedLaunch(work, [process.execPath, fileURLToPath(new URL('./supervisor.mjs', import.meta.url)), ...command], inputs),
    { ...options, stdio: ['pipe', 'ignore', 'pipe'] })
  child.completed = new Promise(resolve => {child.once('error', error => resolve({ error }));child.once('close', (code, signal) => resolve({ code, signal }))})
  return child
}
export async function stopOwned(child) {
  child.stdin.end()
  const ended = await Promise.race([child.completed.then(() => true), delay(5000).then(() => false)])
  if (!ended) { child.kill('SIGKILL'); await child.completed }
}
// Translate only for namespace admission, never for signalling. Traverse descendants
// of our live ChildProcess and use Linux NSpid to map its inner observation.
export async function descendantPid(child, inner) {
  const visit = async pid => {
    try {
      const status = await fs.readFile(`/proc/${pid}/status`, 'utf8')
      const ids = status.match(/^NSpid:\s+(.+)$/m)?.[1].trim().split(/\s+/)
      if (ids?.length > 1 && ids.at(-1) === String(inner)) return String(pid)
      for (const next of (await fs.readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')).trim().split(/\s+/).filter(Boolean)) {
        const found = await visit(next); if (found) return found
      }
    } catch {}
  }
  return visit(child.pid)
}

// Capture the owned ChildProcess, never a host process-group number. Timeout
// closes the containing namespace through its owner before ending this child.
export function captureOwned(command, args, { timeoutMs = 20000, env, stop = async () => {} } = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { env: env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', settled = false
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr, ...result }) }
    const timer = setTimeout(async () => {
      let error
      try { await stop() } catch (failure) { error = failure }
      child.kill('SIGKILL')
      child.stdout.destroy(); child.stderr.destroy()
      finish({code:null,signal:'SIGKILL',timedOut:true,...(error ? {error} : {})})
    }, timeoutMs)
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.stdout.on('error', error => { stderr += error.message })
    child.stderr.on('error', error => { stderr += error.message })
    child.once('error', error => finish({code:null,signal:null,error}))
    child.once('close', (code, signal) => finish({code,signal}))
  })
}
