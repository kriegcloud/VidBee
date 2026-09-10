import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { TaskQueueAPI } from '../../../packages/task-queue/src/api'
import type { ExecutorContext, ExecutorEvents } from '../../../packages/task-queue/src/executor'
import { MemoryPersistAdapter } from '../../../packages/task-queue/src/persist/memory'
import { deferred, fakeTimers, turn } from '../../../packages/task-queue/test/fixtures'
import { AutoTranscriptionCoordinator } from '../../../packages/transcription/src/coordinator'
import { MemoryTranscriptStore } from '../../../packages/transcription/src/memory-store'
import { probeWorker } from '../../../packages/transcription/src/runtime'
import { terminateWorker } from '../../../packages/transcription/src/worker/terminate'

test('worker termination waits for exit and escalates even after a signal was sent', async (t) => {
  const child = spawn(
    process.execPath,
    ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdout.write('ready')"],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  )
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  })
  assert.ok(child.stdout)
  await once(child.stdout, 'data')
  child.kill('SIGTERM')
  assert.equal(child.killed, true)
  await terminateWorker(child, 30)
  assert.equal(child.signalCode, 'SIGKILL')
})

test('runtime probes reap workers that ignore SIGTERM before reporting success', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-probe-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const script = join(root, 'probe.cjs')
  const pidFile = join(root, 'pid')
  writeFileSync(
    script,
    `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdin.on('data',()=>process.stdout.write('{"type":"probe-ok"}\\n'))`
  )
  assert.equal(
    await probeWorker({
      execPath: process.execPath,
      workerScript: script,
      modelsDir: root,
      timeoutMs: 5000
    }),
    true
  )
  const pid = Number(readFileSync(pidFile, 'utf8'))
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})

for (const interruption of ['remove', 'stop'] as const) {
  test(`caption completion cannot enqueue after ${interruption}`, async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'vidbee-coordinator-test-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const source = join(root, 'fixture.mp4')
    writeFileSync(source, 'fixture')
    const persist = new MemoryPersistAdapter()
    const runs: { ctx: ExecutorContext; events: ExecutorEvents }[] = []
    const queue = new TaskQueueAPI({
      persist,
      ...fakeTimers(),
      filePresent: () => true,
      executor: {
        run(ctx, events) {
          runs.push({ ctx, events })
          return { cancel: async () => {}, pause: async () => {} }
        }
      }
    })
    await queue.start()
    t.after(() => queue.stop())
    const gate = deferred()
    const entered = deferred()
    const warnings: unknown[] = []
    const coordinator = new AutoTranscriptionCoordinator({
      queue,
      store: new MemoryTranscriptStore(),
      isEnabled: () => true,
      resolveSourceFile: () => source,
      isModelsReady: () => true,
      tryImportCaptions: async () => {
        entered.resolve()
        await gate.promise
        return false
      },
      logger: {
        warn: (...args) => {
          warnings.push(args)
        }
      }
    })
    coordinator.start()
    t.after(() => coordinator.stop())
    const { id } = await queue.add({ input: { kind: 'video', url: 'https://example.com/a' } })
    const first = runs[0]
    assert.ok(first)
    first.events.onFinish({
      taskId: first.ctx.taskId,
      attemptId: first.ctx.attemptId,
      closedAt: Date.now(),
      stdoutTail: '',
      stderrTail: '',
      result: {
        type: 'success',
        output: { filePath: source, size: 7, durationMs: null, sha256: null }
      }
    })
    await entered.promise
    if (interruption === 'remove') {
      await queue.removeFromHistory(id)
    } else {
      coordinator.stop()
    }
    gate.resolve()
    await turn()
    assert.equal(runs.length, 1)
    assert.equal(warnings.length, 0)
    assert.equal(queue.list({ parentId: id }).tasks.length, 0)
  })
}

for (const outcome of ['result', 'error'] as const) {
  test(`transcription ${outcome} reaps its process before finishing the task`, async (t) => {
    const { TranscriptionExecutor } = await import('../../../packages/transcription/src/executor')
    const { buildTranscriptionInput } = await import('../../../packages/transcription/src/options')
    const root = mkdtempSync(join(tmpdir(), 'vidbee-executor-test-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const script = join(root, 'worker.cjs')
    const pidFile = join(root, 'pid')
    const source = join(root, 'fixture.mp4')
    writeFileSync(source, 'fixture')
    const message =
      outcome === 'result'
        ? {
            type: 'result',
            durationMs: 100,
            result: {
              resultKind: 'no-speech',
              language: null,
              modelVersion: 'fixture',
              asrTier: 'minimal',
              speakers: [],
              segments: []
            }
          }
        : { type: 'error', message: 'fixture worker failed' }
    writeFileSync(
      script,
      `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdin.once('data',()=>process.stdout.write(${JSON.stringify(`${JSON.stringify(message)}\n`)}))`
    )
    const executor = new TranscriptionExecutor({
      store: new MemoryTranscriptStore(),
      workerScript: script,
      modelsDir: root,
      workDir: root,
      resolveFfmpegPath: () => 'ffmpeg',
      execPath: process.execPath,
      forceLayer: 'electron',
      skipProbe: true,
      maxWorkerRestarts: 0
    })
    const result = await new Promise<
      import('../../../packages/task-queue/src/executor').ExecutorFinishEvent
    >((resolve) => {
      executor.run(
        {
          taskId: 'transcription-fixture',
          attemptId: 'attempt',
          attemptNumber: 1,
          input: buildTranscriptionInput({
            downloadTaskId: 'download',
            sourceFilePath: source,
            trigger: 'manual'
          })
        },
        { onSpawn: () => {}, onProgress: () => {}, onStd: () => {}, onFinish: resolve }
      )
    })
    assert.equal(result.result.type, outcome === 'result' ? 'success' : 'error')
    const pid = Number(readFileSync(pidFile, 'utf8'))
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  })
}
