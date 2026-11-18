import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cliPath = fileURLToPath(new URL('../../../../cli/dist/index.mjs', import.meta.url))
const connectionErrors = new Set([
  'DESKTOP_NOT_READY',
  'HOST_UNREACHABLE',
  'API_UNREACHABLE',
  'HANDSHAKE_FAILED',
  'AUTH_FAILED',
  'AUTH_REQUIRED',
  'TOKEN_EXPIRED',
  'CONTRACT_VERSION_MISMATCH',
  'CONTRACT_SCHEMA_MISMATCH'
])

function parseOutput(text) {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return text
  }
}

/** Run the built CLI in the caller's offline namespace against this run's descriptor. */
export async function runCliCases({ runDir, record, command }) {
  await access(cliPath)
  const env = {
    ...process.env,
    HOME: path.join(runDir, 'home'),
    XDG_CONFIG_HOME: path.join(runDir, 'home', '.config'),
    XDG_CACHE_HOME: path.join(runDir, 'home', '.cache'),
    XDG_DATA_HOME: path.join(runDir, 'home', '.local', 'share'),
    XDG_STATE_HOME: path.join(runDir, 'home', '.local', 'state'),
    XDG_RUNTIME_DIR: path.join(runDir, 'home', '.cache'),
    VIDBEE_AUTOMATION_DESCRIPTOR: path.join(runDir, 'automation.json')
  }
  // Never inherit a caller's token or remote target: descriptor discovery is part of the case.
  env.VIDBEE_API = undefined
  env.VIDBEE_TOKEN = undefined
  const cases = [
    ['version', [':version'], true],
    ['status', [':status'], true],
    ['download/list', [':download', 'list'], true],
    ['download/list-page', [':download', 'list', '--limit', '2'], true],
    [
      'download/list-completed',
      [':download', 'list', '--status', 'completed', '--limit', '2'],
      true
    ],
    [
      'download/list-group',
      [':download', 'list', '--group', 'example.invalid', '--limit', '2'],
      true
    ],
    ['download/status', [':download', 'status', 'golden-completed'], true],
    ['download/logs', [':download', 'logs', 'golden-failed'], true],
    ['history/list', [':history', 'list', '--status', 'completed', '--limit', '2'], true],
    ['download/unknown', [':download', 'status', 'golden-unknown'], false],
    ['download/missing-id', [':download', 'status'], false],
    ['download/invalid-limit', [':download', 'list', '--limit', '0'], false],
    ['download/invalid-status', [':download', 'list', '--status', 'unknown'], false],
    ['unknown-command', [':golden-unknown'], false]
  ]
  for (const [name, args, expectSuccess] of cases) {
    const output = await command(
      process.execPath,
      [cliPath, '--vidbee-no-autostart', '--vidbee-json', ...args],
      { env }
    )
    const result = {
      code: output.code,
      stdout: parseOutput(output.stdout),
      stderr: parseOutput(output.stderr)
    }
    await record(`cli/${name}`, result)
    for (const channel of [result.stdout, result.stderr]) {
      if (channel && typeof channel === 'object' && connectionErrors.has(channel.code)) {
        throw new Error(`CLI ${name} could not connect to fixture Desktop: ${channel.code}`)
      }
    }
    if (expectSuccess && (result.code !== 0 || result.stdout?.ok !== true)) {
      throw new Error(`CLI ${name} failed unexpectedly: ${JSON.stringify(result)}`)
    }
    if (!expectSuccess && (result.code === 0 || result.stdout?.ok !== false)) {
      throw new Error(`CLI ${name} did not return its expected error envelope`)
    }
  }
}
