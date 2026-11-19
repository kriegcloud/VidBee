import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/** Verify the entire supplied set, including sample bytes and model configuration. */
export async function verifyTranscriptionModels(directory) {
  const expected = JSON.parse(
    await readFile(new URL('./transcription-models.json', import.meta.url), 'utf8')
  )
  const actual = {}
  const visit = async (relative) => {
    const entries = await readdir(path.join(directory, relative), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.posix.join(relative, entry.name)
      if (entry.isDirectory()) {
        await visit(name)
      } else if (entry.isFile()) {
        actual[name] = createHash('sha256')
          .update(await readFile(path.join(directory, name)))
          .digest('hex')
      } else {
        throw new Error(`Transcription model set contains a non-regular entry: ${name}`)
      }
    }
  }
  await visit('')
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
  const differences = names.filter((name) => expected[name] !== actual[name])
  if (differences.length) {
    throw new Error(`Transcription model manifest mismatch: ${differences.join(', ')}`)
  }
  return expected
}
