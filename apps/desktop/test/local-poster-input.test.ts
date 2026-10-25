import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectLocalPosterInput } from '../src/renderer/src/lib/local-poster-input'

const SHARED_DIR = '/downloads/VSCO/someone/Gallery'

test('nothing is requested while the file check is still running', () => {
  assert.equal(
    selectLocalPosterInput({ existingFilePath: undefined, outputDirectory: SHARED_DIR }),
    null
  )
  assert.equal(
    selectLocalPosterInput({
      collectionSummary: { total: 3 },
      existingFilePath: undefined,
      outputDirectory: SHARED_DIR
    }),
    null
  )
})

test('a single post in a shared directory never sends the directory', () => {
  assert.equal(
    selectLocalPosterInput({ existingFilePath: null, fileCount: 1, outputDirectory: SHARED_DIR }),
    null
  )
  assert.deepEqual(
    selectLocalPosterInput({
      existingFilePath: `${SHARED_DIR}/post.jpg`,
      outputDirectory: SHARED_DIR
    }),
    { directory: null, filePath: `${SHARED_DIR}/post.jpg` }
  )
})

test('a collection row sends its own directory', () => {
  const dir = '/downloads/OnlyFans/creator/post-1'
  assert.deepEqual(
    selectLocalPosterInput({
      collectionSummary: { total: 4 },
      existingFilePath: null,
      outputDirectory: dir
    }),
    { directory: dir, filePath: null }
  )
  assert.deepEqual(
    selectLocalPosterInput({ existingFilePath: null, fileCount: 5, outputDirectory: dir }),
    { directory: dir, filePath: null }
  )
})

test('a row with a remote thumbnail needs no local poster', () => {
  assert.equal(
    selectLocalPosterInput({
      existingFilePath: '/downloads/a.mp4',
      outputDirectory: SHARED_DIR,
      thumbnail: 'https://example.com/t.jpg'
    }),
    null
  )
})
