import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { ExecutorFinishEvent, TaskKind } from '@vidbee/task-queue'
import { GalleryDlExecutor } from '../src/gallery-dl-executor'

for (const kind of ['instagram-profile-category', 'vsco-gallery'] as const) {
  for (const scenario of [
    'complete',
    'failed',
    'unfinished',
    'duplicate',
    'missing',
    'empty'
  ] as const) {
    test(`${kind}: ${scenario} gallery`, async (t) => {
      const root = await mkdtemp(path.join(tmpdir(), 'vidbee-gallery-test-'))
      t.after(() => rm(root, { recursive: true, force: true }))
      const file = path.join(root, 'image.jpg')
      if (scenario !== 'missing') {
        await writeFile(file, scenario === 'empty' ? '' : 'media')
      }
      const prefix = '__VIDBEE_GDL__'
      const lines = [`${prefix}\tprepare\t${file}`]
      if (scenario !== 'unfinished') {
        lines.push(`${prefix}\tafter\t${file}`)
      }
      if (scenario === 'failed') {
        lines.push(`${prefix}\tprepare\tmissing.jpg`, `${prefix}\terror\tmissing.jpg`)
      }
      if (scenario === 'duplicate') {
        lines.push(`${prefix}\tprepare\t${file}`, `${prefix}\tafter\t${file}`)
      }
      const bin = path.join(root, 'fake-gallery')
      await writeFile(
        bin,
        `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(`${lines.join('\n')}\n`)})\n`,
        { mode: 0o755 }
      )
      const executor = new GalleryDlExecutor({
        resolveBinaryPath: () => bin,
        defaultDownloadDir: root
      })
      const result = await new Promise<ExecutorFinishEvent>((resolve) => {
        executor.run(
          {
            taskId: 'gallery',
            attemptId: 'one',
            attemptNumber: 1,
            input: {
              kind: kind as TaskKind,
              url:
                kind === 'vsco-gallery'
                  ? 'https://vsco.co/fixture/gallery'
                  : 'https://www.instagram.com/fixture/photos/'
            }
          },
          { onSpawn() {}, onProgress() {}, onStd() {}, onFinish: resolve }
        )
      })
      assert.equal(result.result.type, scenario === 'complete' ? 'success' : 'error')
      if (result.result.type === 'success') {
        assert.equal(result.result.output.fileCount, 1)
        assert.equal(result.result.output.totalSize, 5)
      }
    })
  }
}
