import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { Task } from '@vidbee/task-queue'
import { resolveTaskSourceFile } from '../src/main/lib/source-file'

test('a legacy video task retried as a photo gallery is not a transcription source', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vidbee-gallery-source-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const filePath = path.join(root, 'photo.jpg')
  await writeFile(filePath, 'photo')
  const task = {
    kind: 'video',
    input: { kind: 'video', url: 'https://www.facebook.com/123/photos' },
    output: { filePath, size: 5, outputDirectory: root, fileCount: 1 }
  } as Task
  assert.equal(resolveTaskSourceFile(task), null)
  // The same file-resolution path remains available to ordinary single-media tasks.
  assert.ok(task.output)
  task.output.outputDirectory = undefined
  assert.equal(resolveTaskSourceFile(task), filePath)
})
