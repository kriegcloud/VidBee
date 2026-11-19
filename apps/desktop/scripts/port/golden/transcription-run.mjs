import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Model presence is an observed contract in the original suite. Run that suite
// unchanged, then the supplied-model scenario on a separate disposable profile.
export async function runTranscriptionSuite({ args, scratch, script }) {
  await mkdir(scratch, { recursive: true })
  const work = await mkdtemp(path.join(scratch, 'combined-'))
  const without = (names) => {
    const result = []
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (names.includes(arg)) {
        if (['--models', '--scratch', '--subset'].includes(arg)) {
          index++
        }
      } else {
        result.push(arg)
      }
    }
    return result
  }
  const run = (argv) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, ...argv], { stdio: 'inherit' })
      const forward = (signal) => child.kill(signal)
      process.on('SIGINT', forward)
      process.on('SIGTERM', forward)
      const release = () => {
        process.off('SIGINT', forward)
        process.off('SIGTERM', forward)
      }
      child.once('error', (error) => {
        release()
        reject(error)
      })
      child.once('exit', (code, signal) => {
        release()
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Golden scenario failed: code=${code}, signal=${signal}`))
        }
      })
    })
  const started = Date.now()
  // --update applies only to new transcription documents; old goldens compare.
  await run([
    ...without(['--models', '--scratch', '--subset', '--update']),
    '--scratch',
    path.join(work, 'original')
  ])
  await run([
    ...without(['--scratch', '--subset']),
    '--scratch',
    path.join(work, 'transcription'),
    '--loopback-only',
    '--subset',
    'transcription'
  ])
  const result = { status: 'passed', elapsedSeconds: (Date.now() - started) / 1000, work }
  await writeFile(path.join(work, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`Combined original and transcription suite passed; evidence ${work}\n`)
}
