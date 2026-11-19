import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { YtDlpExecutor, GalleryDlExecutor } from '../src/index'
import type { ExecutorFinishEvent } from '@vidbee/task-queue-legacy'
import { NODE } from './fixtures/node-runtime'

for (const kind of ['yt-dlp', 'gallery'] as const) test(`${kind} compatibility leaves nonzero leader's descendant pipes until site cancellation`, { timeout: 5000 }, async t => {
  assert.equal(process.version, 'v22.23.4')
  const root = mkdtempSync(join(tmpdir(), 'vidbee-nonzero-descendant-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const binary = join(root, 'fixture.cjs')
  writeFileSync(binary, `#!${NODE}\nconst child=require('node:child_process').spawn(process.execPath,['-e',"process.stdout.write('descendant-ready'+String.fromCharCode(10));process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','inherit','inherit','ipc']});child.on('message',()=>process.exit(7));child.unref();\n`, { mode: 0o755 })
  const executor = kind === 'yt-dlp'
    ? new YtDlpExecutor({ resolveYtDlpPath: () => binary, resolveFfmpegLocation: () => root, defaultDownloadDir: root, buildArgs: () => ['fixture'], killGraceMs: 0 })
    : new GalleryDlExecutor({ resolveBinaryPath: () => binary, defaultDownloadDir: root, killGraceMs: 0 })
  let ready!: () => void
  const descendantReady = new Promise<void>(resolve => { ready = resolve })
  let finish!: (event: ExecutorFinishEvent) => void
  const completed = new Promise<ExecutorFinishEvent>(resolve => { finish = resolve })
  let finished = false
  let pid = -1
  const run = executor.run({ taskId: 'task', attemptId: 'attempt', attemptNumber: 1, input: { kind: 'video', url: 'https://fixture.invalid/video' } }, {
    onSpawn: event => { pid = event.pid }, onProgress() {}, onStd: event => { if (event.line.includes('descendant-ready')) ready() }, onFinish: event => { finished = true; finish(event) },
  })
  t.after(() => { if (pid > 0) { try { process.kill(-pid, 'SIGKILL') } catch {} } })
  await descendantReady
  let leaderGone = false
  for (let attempt = 0; attempt < 100 && !leaderGone; attempt++) {
    try { process.kill(pid, 0) } catch { leaderGone = true }
    if (!leaderGone) await new Promise<void>(resolve => setTimeout(resolve, 1))
  }
  assert.equal(leaderGone, true)
  assert.equal(finished, false)
  await run.cancel(0)
  assert.equal((await completed).result.type, 'cancelled')
})
