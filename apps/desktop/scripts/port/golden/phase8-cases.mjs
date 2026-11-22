import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCliAdditions } from './cli-additions-cases.mjs'
import { runExtensionApiCases } from './extension-api-cases.mjs'
import { startLoopback } from './loopback.mjs'
import { PHASE8_EXCLUSIONS } from './phase8-exclusions.mjs'
import { phase8Prerequisites } from './phase8-prerequisites.mjs'
import { runStandardBrowserCases } from './standard-browser-cases.mjs'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))
export async function runPhase8Cases({
  client,
  runDir,
  build,
  record,
  roots,
  command,
  extensionOnly,
  cliOnly
}) {
  const skipped = await phase8Prerequisites(build)
  if (skipped) {
    process.stdout.write(`${skipped}\n`)
    return
  }
  const server = await startLoopback(runDir, { phase8: true })
  const directory = path.join(runDir, 'phase8')
  const downloads = path.join(directory, 'downloads')
  const alias = path.join(root, `.g8-${path.basename(path.dirname(runDir))}`)
  const logFile = path.join(runDir, 'userdata/logs/main.log')
  const logStart = (await readFile(logFile, 'utf8')).length
  const raw = []
  const compare = record
  record = async (name, value) => {
    if (PHASE8_EXCLUSIONS.has(name)) {
      raw.push({ excluded: name, value })
      return
    }
    await compare(name, value)
  }
  let linked = false
  try {
    await mkdir(downloads, { recursive: true })
    await symlink(downloads, alias)
    linked = true
    roots.unshift([alias, '<run>/phase8/downloads'])
    if (!cliOnly) {
      await runExtensionApiCases({ runDir, server, record, raw })
    }
    if (!extensionOnly) {
      await runCliAdditions({ client, runDir, build, record, roots, command, server, alias, raw })
    }
    let browserUrl
    if (
      !(
        extensionOnly ||
        cliOnly ||
        process.argv.includes('--phase8-only') ||
        process.argv.includes('--subset')
      )
    ) {
      browserUrl = await runStandardBrowserCases({ runDir, build, record, command })
    }
    const allowed = [
      'Using fallback thinking options: TypeError: fetch failed',
      'Failed to cache thumbnail: TypeError: fetch failed',
      `Failed to fetch metadata for: ${server.url}/404-phase8.mp4 Error: ERROR: [generic] 404-phase8:`,
      ...(browserUrl
        ? [
            `Failed to fetch metadata for: ${browserUrl}/404-phase8.mp4 Error: ERROR: [generic] 404-phase8:`
          ]
        : [])
    ]
    const unexpected = (await readFile(logFile, 'utf8'))
      .slice(logStart)
      .split('\n')
      .filter(
        (line) => line.includes('[error]') && !allowed.some((signature) => line.includes(signature))
      )
    if (unexpected.length) {
      throw new Error(`Unexpected phase 8 application errors: ${JSON.stringify(unexpected)}`)
    }
  } finally {
    try {
      await writeFile(path.join(directory, 'raw.json'), JSON.stringify(raw, null, 2))
    } finally {
      try {
        if (linked) {
          await rm(alias, { force: true })
        }
      } finally {
        await server.close()
      }
    }
  }
}
