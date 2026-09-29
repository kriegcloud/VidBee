import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { saveEditedImage } from '../src/main/lib/media-files'

test('copy collision numbering is exclusive and preserves the source and earlier edits', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-edits-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourcePath = join(root, 'photo.png')
  await writeFile(sourcePath, 'original')
  await writeFile(join(root, 'photo_edited.png'), 'first edit')
  const req = {
    sourcePath,
    format: 'png',
    mode: 'copy',
    data: new TextEncoder().encode('new edit').buffer
  } as const
  const results = await Promise.all([saveEditedImage(req), saveEditedImage(req)])
  assert.deepEqual(results.map((result) => result.path).sort(), [
    join(root, 'photo_edited-2.png'),
    join(root, 'photo_edited-3.png')
  ])
  assert.equal(await readFile(sourcePath, 'utf8'), 'original')
  assert.equal(await readFile(join(root, 'photo_edited.png'), 'utf8'), 'first edit')
})

test('overwrite rejects a format extension mismatch without changing the source', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-overwrite-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourcePath = join(root, 'photo.png')
  await writeFile(sourcePath, 'original')
  await assert.rejects(
    saveEditedImage({ sourcePath, format: 'webp', mode: 'overwrite', data: new ArrayBuffer(0) }),
    /different format extension/
  )
  assert.equal(await readFile(sourcePath, 'utf8'), 'original')
  assert.deepEqual(await readdir(root), ['photo.png'])
})

test('overwrite replaces source bytes and removes its temporary file', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-overwrite-ok-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourcePath = join(root, 'photo.jpg')
  await writeFile(sourcePath, 'original')
  assert.deepEqual(
    await saveEditedImage({
      sourcePath,
      format: 'jpeg',
      mode: 'overwrite',
      data: new TextEncoder().encode('edited').buffer
    }),
    { path: sourcePath }
  )
  assert.equal(await readFile(sourcePath, 'utf8'), 'edited')
  assert.deepEqual(await readdir(root), ['photo.jpg'])
})
