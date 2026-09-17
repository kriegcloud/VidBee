import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { ExecutorFinishEvent } from '@vidbee/task-queue'
import { GalleryDlExecutor } from '../src/gallery-dl-executor'

for (const scenario of [
  'exhausted',
  'symlink-destination',
  'limit',
  'incomplete',
  'missing-final',
  'missing-manifest',
  'wrong-manifest',
  'malformed',
  'failed-asset'
] as const) {
  test(`social completion requires verified traversal: ${scenario}`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'vidbee-social-completion-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const manifest = path.join(root, '.vidbee', 'social-media.sqlite')
    await mkdir(path.dirname(manifest))
    if (scenario !== 'missing-manifest') {
      await writeFile(manifest, 'manifest')
    }
    const summary = {
      posts: 0,
      images: 0,
      videos: 0,
      downloaded: 0,
      existing: 0,
      failed: scenario === 'failed-asset' ? 1 : 0,
      totalSize: 0,
      reason:
        scenario === 'limit' ? 'limit' : scenario === 'incomplete' ? 'incomplete' : 'exhausted',
      manifestPath: scenario === 'wrong-manifest' ? '/unrelated/manifest' : manifest,
      startedAt: 1,
      finishedAt: 2
    }
    const line =
      scenario === 'malformed'
        ? '__VIDBEE_SOCIAL__\t{bad json}\n'
        : `__VIDBEE_SOCIAL__\t${JSON.stringify({ type: scenario === 'missing-final' ? 'progress' : 'complete', summary })}\n`
    const bin = path.join(root, 'fake-gallery')
    await writeFile(bin, `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(line)})\n`, {
      mode: 0o755
    })
    const destination = scenario === 'symlink-destination' ? path.join(root, 'chosen') : root
    if (scenario === 'symlink-destination') {
      await symlink(root, destination, 'junction')
    }
    const executor = new GalleryDlExecutor({
      resolveBinaryPath: () => bin,
      defaultDownloadDir: destination
    })
    const result = await new Promise<ExecutorFinishEvent>((resolve) => {
      executor.run(
        {
          taskId: 'social',
          attemptId: 'one',
          attemptNumber: 1,
          input: { kind: 'social-media', url: 'https://x.com/fixture/tweets' }
        },
        { onSpawn() {}, onProgress() {}, onStd() {}, onFinish: resolve }
      )
    })
    assert.equal(
      result.result.type,
      ['exhausted', 'limit', 'symlink-destination'].includes(scenario) ? 'success' : 'error'
    )
    if (result.result.type === 'success') {
      assert.equal(result.result.output.fileCount, 0)
      assert.equal(
        result.result.output.collectionSummary?.reason,
        scenario === 'limit' ? 'limit' : 'exhausted'
      )
    }
  })
}
