import { afterEach, expect, it, vi } from 'vitest'

const fault = vi.hoisted((): { value: unknown } => ({ value: undefined }))
vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>()
  const mkdirSync = () => { throw fault.value }
  return { ...real, mkdirSync, default: { ...real, mkdirSync } }
})
import * as Effect from 'effect/Effect'
import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { HostFailure, InvalidDownload } from '../../downloader-core/src/Downloader.errors.js'
import { argumentsRuntime, argumentError } from '../src/arguments-runtime.js'
import { DownloaderCore, retryTransientYtDlpNetworkError } from '@vidbee/downloader-core-legacy'

afterEach(() => vi.unstubAllEnvs())
it.each([[undefined], [null], ['opaque'], [{ fixture: 'original failure' }], [new Error('original error')]])(
  'preserves the original initialize host rejection by identity: %s',
  async (value) => {
    fault.value = value
    vi.stubEnv('YTDLP_JS_RUNTIME', 'none')
    const core = new DownloaderCore({ downloadDir: '/fixture/downloads' })
    await expect(core.initialize()).rejects.toBe(value)
  }
)

it('does not reinterpret opaque retry rejections as native tagged failures', async () => {
  const values = [
    { legacyMessage: 'opaque' },
    { legacyMessage: 'opaque', cause: undefined },
    { _tag: 'HostFailure', legacyMessage: 'opaque', cause: 42 },
    HostFailure.make({ operation: 'injected', legacyMessage: 'opaque', cause: 42 })
  ]
  for (const value of values) await expect(retryTransientYtDlpNetworkError(() => Promise.reject(value))).rejects.toBe(value)
})
it('retains a callback defect even when it is an actual native tagged error', () => {
  const original = InvalidDownload.make({ operation: 'callback', legacyMessage: 'original tagged callback' })
  let observed: unknown
  let threw = false
  try { runLegacySync(argumentsRuntime, Effect.die(original), argumentError) } catch (error) { threw = true; observed = error }
  expect(threw).toBe(true)
  expect(observed).toBe(original)
})
