import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

/** An allowlisted session with no path to the owner's desktop services or home. */
export function isolatedEnvironment(root: string): NodeJS.ProcessEnv {
  mkdirSync(`${root}/runtime`, { mode: 0o700 })
  return { PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC', TMPDIR: root,
    HOME: root, XDG_CONFIG_HOME: root, XDG_CACHE_HOME: root, XDG_DATA_HOME: root,
    XDG_RUNTIME_DIR: `${root}/runtime`, DBUS_SESSION_BUS_ADDRESS: 'disabled:',
    PULSE_SERVER: `unix:${root}/runtime/no-pulse`, PIPEWIRE_REMOTE: `${root}/runtime/no-pipewire` }
}

/** PID namespace init death also kills detached Chromium descendants. Always reap the leader. */
export async function runOffline(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''; let stderr = ''; let error: Error | undefined
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  child.on('error', (failure) => { error = failure })
  const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch { /* already exited */ } } }
  const timeout = setTimeout(() => { error = new Error('Offline fixture exceeded 180000ms'); kill() }, 180000)
  try {
    const [status, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) => child.once('close', (code, signal) => resolve([code, signal])))
    return { stdout, stderr, status, signal, error }
  } finally { clearTimeout(timeout); kill() }
}
