/**
 * Isolated AI worker. Loaded only in a child process so sherpa-onnx-node
 * cannot stall the Electron / API event loop.
 */
import type {WorkerWireProbe} from '../../../transcription/src/Worker.model'
import {WorkerProtocol} from '../../../transcription/src/WorkerProtocol.service'
import {runStateless} from '../bridge/stateless'
import {WorkerHandler} from '../../../transcription/src/WorkerHandler.service'
import {makeWorkerRuntime} from '../bridge/worker-handler-runtime'
import {setStdoutBlocking,type WorkerInbound,type WorkerOutbound,writeMessageSync} from './protocol'

setStdoutBlocking()

const send = (message: WorkerOutbound): void => {
  // Blocking write so Electron-as-Node pipe buffering cannot starve the watchdog.
  // Retries short writes and EAGAIN: a full pipe otherwise kills long transcripts.
  writeMessageSync(1, message)
}

/**
 * Report a fatal worker exception over the protocol, then exit.
 *
 * @param err Uncaught exception or rejection reason.
 */
const failHard = (err: unknown): void => {
  const message = err instanceof Error ? err.message : String(err)
  try {
    send({ type: 'error', message })
  } catch {
    /* stdout may already be gone */
  }
  process.exit(1)
}

process.on('uncaughtException', failHard)
process.on('unhandledRejection', failHard)

const run = async (): Promise<void> => {
  const abort = new AbortController()
  process.on('SIGTERM', () => abort.abort())
  process.on('SIGINT', () => abort.abort())

  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk
    let idx = buffer.indexOf('\n')
    while (idx >= 0) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      const message = runStateless(WorkerProtocol.use(service=>service.parseInbound(line)))
      if (message?.type === 'cancel') {
        abort.abort()
      } else if (message?.type === 'probe') {
        void handleProbe(message).then(() => {
          process.stdout.write('', () => process.exit(0))
        }, failHard)
      } else if (message?.type === 'start') {
        // Workers handle one request. Exit after sending the result so native
        // models, stdin listeners, and ONNX threads cannot outlive the task.
        void handleStart(message, abort.signal).then(() => {
          process.stdout.write('', () => process.exit(0))
        }, failHard)
      }
      idx = buffer.indexOf('\n')
    }
  })
}

const owner=makeWorkerRuntime()
const handleProbe=(message:WorkerWireProbe):Promise<void>=>owner.runHandler(WorkerHandler.use(service=>service.probe(message)))
const handleStart=(message:Extract<WorkerInbound,{type:'start'}>,signal:AbortSignal):Promise<void>=>owner.runHandler(WorkerHandler.use(service=>service.start(message,signal)))

void run()
