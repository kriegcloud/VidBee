import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { TaskQueueAPI } from '@vidbee/task-queue-legacy'
import { MemoryPersistAdapter } from '@vidbee/task-queue-legacy/persist'
import type { PersistTransitionInput } from '@vidbee/task-queue-legacy/persist'
import { YtDlpExecutor } from '../src/yt-dlp-executor'

const turns = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
it('separate queue/downloader runtimes preserve nested reads and return while finish persistence is pending', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vidbee-queue-reentry-'))
  const file = join(root, 'media.mp4')
  writeFileSync(file, 'media')
  const stdout = new PassThrough(); const stderr = new PassThrough()
  const emitter = Object.assign(new EventEmitter(), { ytDlpProcess: { stdout, stderr, kill: () => true } })
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  let completionWriteStarted = false
  class Persist extends MemoryPersistAdapter {
    override async upsertTask(input: PersistTransitionInput) {
      if (input.task.status === 'completed') { completionWriteStarted = true; await held }
      return super.upsertTask(input)
    }
  }
  const executor = new YtDlpExecutor({ resolveYtDlpPath: () => '/fixture/yt-dlp', resolveFfmpegLocation: () => '/fixture/ffmpeg', defaultDownloadDir: root, clock: () => 1000, buildArgs: () => ['fixture'], spawnFn: () => emitter })
  const markers: string[] = []
  let launched = false
  const queue = new TaskQueueAPI({ persist: new Persist(), executor: { run(ctx, events) { markers.push('queue-enters-downloader'); const handle = executor.run(ctx, events); launched = true; markers.push('downloader-returned'); return handle } }, idleQueueKickMs: 0, clock: () => 1000, filePresent: () => true, setTimer: () => 1, clearTimer: () => {} })
  queue.subscribe(event => {
    if (event.type === 'progress') { markers.push('downloader-enters-queue'); expect(queue.get(event.taskId)?.progress.percent).toBe(0.5); expect(queue.stats().running).toBe(1); markers.push('nested-read-returned') }
  })
  try {
    await queue.start(); await queue.add({ id: 'task', input: { kind: 'video', url: 'https://fixture.invalid/video' } }); await turns()
    expect(launched).toBe(true)
    emitter.emit('progress', { percent: 50, totalSize: '10MiB' })
    expect(markers).toContain('nested-read-returned')
    expect(queue.get('task')?.progress.percent).toBe(0.5)
    stdout.emit('data', Buffer.from(`[Merger] combine\n__VIDBEE_OUTPUT_PATH__:${file}\n`))
    await turns()
    markers.push('before-close')
    emitter.emit('close', 0)
    markers.push('close-returned')
    await turns()
    expect(completionWriteStarted).toBe(true)
    expect(markers.indexOf('close-returned')).toBeGreaterThan(markers.indexOf('before-close'))
    release(); await turns()
    expect(queue.get('task')?.status).toBe('completed')
  } finally { release(); await queue.stop(); rmSync(root, { recursive: true, force: true }) }
})
