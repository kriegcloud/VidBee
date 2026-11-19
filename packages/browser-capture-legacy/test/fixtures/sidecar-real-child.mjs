import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const [root, site, ...args] = process.argv.slice(2)
const target = process.env.VIDBEE_PROCESS_SITE
const trace = (event) => appendFileSync(path.join(root, 'control.jsonl'), JSON.stringify({ site, ...event }) + '\n')
trace({ event: 'started', pid: process.pid })
if (site === 'pactl' && args[0] !== 'load-module') { process.stdout.write('module-id\n'); process.exit(0) }
if (site === 'recorder') {
  writeFileSync(args.at(-1), Buffer.from([1, 2, 3]))
  let eof = false
  process.stdin.on('end', () => { eof = true; trace({ event: 'eof' }) })
  process.stdin.on('data', (chunk) => {
    trace({ event: 'stdin', bytes: [...chunk], eof, readableEnded: process.stdin.readableEnded })
    if (chunk.includes(113)) setTimeout(() => { trace({ event: 'q-without-eof', eof, readableEnded: process.stdin.readableEnded }); process.exit(0) }, 30)
  })
  process.on('SIGINT', () => trace({ event: 'SIGINT' }))
}
trace({ event: 'ready' })
if (site === target) {
  const goal = 16 * 1024 * 1024
  const chunk = Buffer.alloc(64 * 1024, 120)
  let bytes = 0
  let waitingDrain = false
  let drains = 0
  let inspected = false
  const inspector = setInterval(() => {
    if (!inspected && existsSync(path.join(root, `${site}.inspect`))) {
      inspected = true
      trace({ event: 'inspection', bytes, waitingDrain, drains, writableLength: process.stderr.writableLength })
    }
  }, 5)
  const write = () => {
    while (bytes < goal) {
      bytes += chunk.length
      if (!process.stderr.write(chunk)) {
        waitingDrain = true
        trace({ event: 'backpressure', bytes, writableLength: process.stderr.writableLength })
        process.stderr.once('drain', () => { waitingDrain = false; drains += 1; write() })
        return
      }
    }
    clearInterval(inspector)
    process.stderr.write('', () => {
      trace({ event: 'complete', bytes, drains })
      writeFileSync(path.join(root, `${site}.complete`), 'complete')
      if (site === 'pactl') { process.stdout.write('module-id\n'); process.exit(0) }
    })
  }
  write()
} else if (site === 'pactl') { process.stdout.write('module-id\n'); process.exit(0) }
