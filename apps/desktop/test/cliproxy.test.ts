import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readCliProxyToken } from '../src/main/lib/cliproxy'
import { aiProviderNeedsApiKey, resolveAiProviderBaseUrl } from '../src/shared/ai-presets'

const fixture = () => {
  const home = mkdtempSync(join(tmpdir(), 'vidbee-cliproxy-'))
  const root = join(home, '.cli-proxy-api')
  mkdirSync(root)
  return { home, root, cleanup: () => rmSync(home, { recursive: true, force: true }) }
}

test('CLIProxyAPI uses the fixed loopback endpoint without a user-supplied key', () => {
  assert.equal(aiProviderNeedsApiKey('cliproxy'), false)
  assert.equal(
    resolveAiProviderBaseUrl('cliproxy', 'https://example.com/v1'),
    'http://127.0.0.1:8317/v1'
  )
})

test('reads the shared client token afresh, preferring it to YAML configuration', () => {
  const { home, root, cleanup } = fixture()
  try {
    writeFileSync(join(root, 'config.yaml'), 'api-keys: [config-token]')
    writeFileSync(join(root, 'client-token'), ' file-token\n')
    assert.equal(readCliProxyToken({}, home), 'file-token')
    writeFileSync(join(root, 'client-token'), 'rotated-token')
    assert.equal(readCliProxyToken({}, home), 'rotated-token')
    assert.equal(readCliProxyToken({ VIDBEE_PROXY_API_KEY: ' env-token ' }, home), 'env-token')
  } finally {
    cleanup()
  }
})

test('falls back to config only for an absent default token and honors explicit paths', () => {
  const { home, root, cleanup } = fixture()
  try {
    const config = join(root, 'config.yaml')
    writeFileSync(config, 'api-keys: ["", config-token]')
    assert.equal(readCliProxyToken({}, home), 'config-token')
    assert.throws(
      () => readCliProxyToken({ VIDBEE_PROXY_TOKEN_FILE: join(root, 'missing') }, home),
      /Unable to read the CLIProxyAPI client token file/
    )
    writeFileSync(join(root, 'client-token'), '')
    assert.throws(() => readCliProxyToken({}, home), /client token file/)
    assert.equal(readCliProxyToken({ VIDBEE_PROXY_CONFIG: config }, home), 'config-token')
  } finally {
    cleanup()
  }
})

test('never includes YAML source or credentials in configuration errors', () => {
  const { home, root, cleanup } = fixture()
  try {
    writeFileSync(join(root, 'config.yaml'), 'api-keys: [secret-never-show-this')
    assert.throws(() => readCliProxyToken({}, home), {
      message: 'Unable to read CLIProxyAPI client configuration'
    })
    writeFileSync(join(root, 'config.yaml'), 'api-keys: wrong-type')
    assert.throws(() => readCliProxyToken({}, home), /has no client token/)
  } finally {
    cleanup()
  }
})
