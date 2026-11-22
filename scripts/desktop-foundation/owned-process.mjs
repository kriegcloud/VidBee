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
