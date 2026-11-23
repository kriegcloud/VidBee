import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

// Runs beneath Bubblewrap's namespace init. EOF is the only teardown command; no mutable PID target.
const child = spawn(process.argv[2], process.argv.slice(3), { stdio: ['ignore', 'inherit', 'inherit'] })
let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  child.kill('SIGTERM')
  await Promise.race([new Promise(resolve => child.once('close', resolve)), delay(3000)])
  // Exiting this command ends Bubblewrap's namespace init, which makes the
  // kernel terminate every remaining namespace member.
  process.exit(0)
}
process.stdin.resume()
process.stdin.on('end', stop)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop)
child.on('error', error => { console.error(error.message); process.exit(127) })
child.on('close', (code, signal) => { if (!stopping) process.exit(code ?? (signal ? 1 : 0)) })
