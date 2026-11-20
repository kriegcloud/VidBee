// The executable has no SQLite flag. Exercise only its documented local-client seam.
import { createLocalClient } from '../../../../cli-legacy/src/local-client.ts'

const [database, downloads, ytDlpPath, ffmpegLocation, url] = process.argv.slice(2)
const options = {
  persist: 'sqlite',
  sqlitePath: database,
  defaultDownloadDir: downloads,
  ytDlpPath,
  ffmpegLocation,
  rng: () => 0.5
}
let first
let second
try {
  first = await createLocalClient(options)
  const admitted = await first.add({
    input: {
      kind: 'video',
      url,
      title: 'golden-local-sqlite',
      options: {
        type: 'video',
        customDownloadPath: downloads,
        customFilenameTemplate: 'sqlite.%(ext)s'
      }
    },
    maxAttempts: 0
  })
  const deadline = Date.now() + 120_000
  let task
  while (Date.now() < deadline) {
    task = await first.get(admitted.id)
    if (['completed', 'failed', 'cancelled', 'retry-scheduled'].includes(task.status)) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  if (!['completed', 'failed', 'cancelled', 'retry-scheduled'].includes(task.status)) {
    throw new Error('SQLite download condition timed out')
  }
  await first.shutdown()
  first = undefined
  second = await createLocalClient(options)
  const reopened = await second.get(admitted.id)
  const snapshot = ({ progress, log, ...value }) => ({
    ...value,
    progressFields: Object.keys(progress ?? {})
  })
  process.stdout.write(JSON.stringify({ before: snapshot(task), reopened: snapshot(reopened) }))
} finally {
  await first?.shutdown()
  await second?.shutdown()
}
