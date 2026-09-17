import { readFile, stat } from 'node:fs/promises'
import { encodeSidecarEvent, parseCaptureJob } from './protocol'
import { runCapture } from './run-capture'

const emit = (event: Parameters<typeof encodeSidecarEvent>[0]): void => {
  process.stdout.write(`${encodeSidecarEvent(event)}\n`)
}

const readJobPath = (): string => {
  const flag = process.argv.indexOf('--job')
  const path = flag >= 0 ? process.argv[flag + 1] : process.argv[2]
  if (!path) {
    throw new Error('Usage: browser-capture-sidecar --job <job.json>')
  }
  return path
}

const abort = new AbortController()
const onStop = (): void => {
  abort.abort()
}
process.on('SIGTERM', onStop)
process.on('SIGINT', onStop)

const main = async (): Promise<void> => {
  emit({ pid: process.pid, type: 'spawn' })
  const job = parseCaptureJob(JSON.parse(await readFile(readJobPath(), 'utf8')))
  const result = await runCapture(job, {
    signal: abort.signal,
    onLog: (message) => emit({ message, type: 'log' }),
    onProgress: (state) =>
      emit({
        type: 'progress',
        percent: state.percent,
        currentTime: state.currentTime,
        duration: state.duration
      })
  })
  const info = await stat(result.filePath)
  if (info.size <= 0) {
    throw new Error('ffmpeg produced an empty capture file')
  }
  emit({
    type: 'done',
    filePath: result.filePath,
    size: info.size,
    durationMs: result.durationMs
  })
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  emit({ message, type: 'error' })
  process.exitCode = 1
})
