import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stableBrowserDocuments } from './extension-browser-recordings.mjs'

const args = process.argv.slice(2)
const directories = args.filter((value) => value !== '--update')
if (directories.length !== 5) {
  throw new Error('Supply exactly five consecutive suite directories')
}
const runs = []
for (const directory of directories) {
  const result = JSON.parse(
    await readFile(path.join(directory, 'run/extension-browser/results.json'), 'utf8')
  )
  const parity = JSON.parse(
    await readFile(path.join(directory, 'run/extension-browser/parity.json'), 'utf8')
  )
  if (parity.status !== 'equal') {
    const review = JSON.parse(
      await readFile(path.join(directory, 'run/extension-browser/parity-review.json'), 'utf8')
    )
    const digest = createHash('sha256').update(JSON.stringify(parity.differences)).digest('hex')
    if (
      review.report !== 'docs/effect-port/reports/8-extension-browser.md' ||
      review.status !== 'classified' ||
      review.differenceSha256 !== digest ||
      review.items.length !== parity.differences.length
    ) {
      throw new Error('Resolve and document every old/new difference before admission')
    }
    for (const [index, item] of review.items.entries()) {
      if (
        item.index !== index ||
        !['declared-change', 'reported-defect', 'unstable-observation'].includes(
          item.classification
        ) ||
        typeof item.explanation !== 'string' ||
        !item.explanation.trim()
      ) {
        throw new Error('Incomplete parity classification')
      }
      if (
        item.classification === 'declared-change' &&
        ![
          'Truthy non-string tab URL',
          'Detached popup initialization/navigation failure',
          'Detached icon failure',
          'Initial cache-read failure',
          'Pending-entry write failure',
          'Error-entry write failure',
          'Non-object successful metadata response root',
          'Null modeled metadata field',
          'Wrong-kind modeled metadata field',
          'Non-array `formats`',
          'Non-object format element',
          'Unknown metadata fields',
          'Present non-record storage root',
          'Undecodable selected cache entry',
          'Undecodable pruning timestamp',
          'Malformed storage notification root',
          'Request header name case'
        ].includes(item.section9Row)
      ) {
        throw new Error('Declared change must name its section 9 row')
      }
    }
  }
  if (result.length !== 2 || result.some((value) => value.status !== 'passed')) {
    throw new Error('Both old and new must complete')
  }
  runs.push(result.find((value) => value.label === 'new'))
}
const admission = stableBrowserDocuments(runs)
// Full differing values stay with synthetic scratch evidence, not public fixtures.
await writeFile(
  path.join(directories[4], 'browser-stability.json'),
  JSON.stringify(admission, null, 2)
)
if (args.includes('--update')) {
  const output = fileURLToPath(new URL('../../../test/golden/', import.meta.url))
  await mkdir(output, { recursive: true })
  for (const value of admission.stable) {
    const text = `${JSON.stringify(value, null, 2)}\n`
    if (text.includes('/home/')) {
      throw new Error('Private path in browser golden')
    }
    await writeFile(path.join(output, `extension-browser--${value.name}.json`), text)
  }
}
process.stdout.write(
  `${JSON.stringify({ stable: admission.stable.map((value) => value.name), unstable: admission.unstable.map((value) => value.name) })}\n`
)
