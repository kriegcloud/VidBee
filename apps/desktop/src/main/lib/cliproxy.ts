import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'

/** Read the workstation proxy credential only in the main process, without persisting it. */
export function readCliProxyToken(env = process.env, home = homedir()): string {
  const explicit = env.VIDBEE_PROXY_API_KEY?.trim()
  if (explicit) {
    return explicit
  }
  if (env.VIDBEE_PROXY_TOKEN_FILE || !env.VIDBEE_PROXY_CONFIG) {
    try {
      const token = readFileSync(
        env.VIDBEE_PROXY_TOKEN_FILE || join(home, '.cli-proxy-api/client-token'),
        'utf8'
      ).trim()
      if (!token) {
        throw new Error('Empty token')
      }
      return token
    } catch (error) {
      if (
        env.VIDBEE_PROXY_TOKEN_FILE ||
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      ) {
        throw new Error('Unable to read the CLIProxyAPI client token file')
      }
    }
  }
  // YAML errors can contain credential source text; never propagate them.
  try {
    const config = parse(
      readFileSync(env.VIDBEE_PROXY_CONFIG || join(home, '.cli-proxy-api/config.yaml'), 'utf8')
    ) as { 'api-keys'?: unknown } | null
    const keys = config?.['api-keys']
    if (Array.isArray(keys)) {
      const token = keys.find((key): key is string => typeof key === 'string' && !!key.trim())
      if (token) {
        return token.trim()
      }
    }
  } catch {
    throw new Error('Unable to read CLIProxyAPI client configuration')
  }
  throw new Error('CLIProxyAPI client configuration has no client token')
}
