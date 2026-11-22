import assert from 'node:assert/strict'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditDns } from './dns-audit.mjs'
import { runExtensionBrowser } from './extension-browser.mjs'
import { extensionBrowserFixture } from './extension-browser-fixture.mjs'
import { startLoopback } from './loopback.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')

/** Compare admitted current-browser documents; paired pre-port review stays separate. */
export async function runStandardBrowserCases({ runDir, build, record, command }) {
  const fixture = path.join(runDir, 'userdata/phase8-fixtures/page.html')
  const template = await readFile(fixture, 'utf8')
  let result
  let server
  try {
    await writeFile(fixture, extensionBrowserFixture(template))
    // Phase-8 routes cache their template when the server starts.
    server = await startLoopback(runDir, { phase8: true })
    result = await runExtensionBrowser({
      runDir,
      extension: path.join(root, 'apps/extension/.output/chrome-mv3'),
      fixtureServer: server,
      normalizationRoots: [
        [build, '<build>'],
        [root, '<repo>']
      ]
    })
  } finally {
    try {
      await server?.close()
    } finally {
      await writeFile(fixture, template)
    }
  }
  await writeFile(
    path.join(runDir, 'extension-browser/results.json'),
    JSON.stringify(result, null, 2)
  )
  if (result.status !== 'passed') {
    assert.notEqual(process.env.VIDBEE_REQUIRE_REAL_BROWSER, '1', result.skip)
    return
  }
  const documents = (await readdir(path.join(root, 'apps/desktop/test/golden'))).filter((file) =>
    /^extension-browser--.*\.json$/.test(file)
  )
  assert.ok(documents.length > 0, 'No admitted extension browser documents')
  for (const file of documents) {
    const name = file.slice('extension-browser--'.length, -5)
    const actual = result.recordings.find((value) => value.name === name)
    assert.ok(actual, `Missing browser observation: ${name}`)
    await record(`extension-browser/${name}`, actual)
  }

  // This document needs a different host configuration and its own disposable app.
  const scratch = path.join(runDir, 'browser-unavailable')
  await mkdir(scratch, { recursive: true })
  const output = await command(
    process.execPath,
    [
      path.join(here, 'browser-capture-unavailable.mjs'),
      '--build',
      build,
      '--scratch',
      scratch,
      '--seed',
      path.join(path.dirname(runDir), 'seed')
    ],
    { timeoutMs: 240_000 }
  )
  await writeFile(path.join(scratch, 'command.json'), JSON.stringify(output, null, 2))
  assert.equal(output.code, 0, `${output.stdout}\n${output.stderr}`)
  assert.equal(output.signal, null)
  const works = (await readdir(scratch)).filter((name) => name.startsWith('unavailable-'))
  assert.equal(works.length, 1)
  const work = path.join(scratch, works[0])
  const receipt = JSON.parse(await readFile(path.join(work, 'result.json'), 'utf8'))
  assert.equal(receipt.status, 'passed')
  assert.equal(receipt.comparisons, 1)
  await auditDns(work, ['run'])
  process.stdout.write(output.stdout)
  return server.url
}
