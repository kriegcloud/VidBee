import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { isVendoredYtDlpBuild } from '../src/main/lib/bundled-resources-path'
import { YtDlpKernelService } from '../src/main/lib/ytdlp-kernel-service'

for (const cachedVersion of ['2026.08.19', '2099.01.01']) {
  test(`vendored runtime overrides cached ${cachedVersion} without changing it`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'vidbee-vendor-test-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const resources = join(root, 'resources')
    const kernelRoot = join(root, 'kernel')
    const cachedPath = join(kernelRoot, 'bundles', 'stock', 'yt-dlp')
    await mkdir(resources, { recursive: true })
    await mkdir(join(kernelRoot, 'bundles', 'stock'), { recursive: true })
    const bundledYtDlpPath = join(resources, 'yt-dlp_linux')
    const bundledNodePath = join(resources, 'node')
    for (const path of [bundledYtDlpPath, bundledNodePath, cachedPath]) {
      await writeFile(path, 'test executable', { mode: 0o755 })
    }
    await writeFile(join(resources, '.ytdlp-vendored'), '{}')
    const statePath = join(kernelRoot, 'state.json')
    const state = JSON.stringify({
      schemaVersion: 2,
      active: {
        id: 'stock',
        ytDlp: {
          relativePath: 'bundles/stock/yt-dlp',
          sha256: 'a'.repeat(64),
          size: 15,
          version: cachedVersion
        }
      },
      previous: null,
      failureCount: 0,
      nextCheckAt: 0
    })
    await writeFile(statePath, state)
    let activatedPath: string | undefined
    const commands: string[][] = []
    const service = new YtDlpKernelService({
      activate: ({ ytDlpPath }) => {
        activatedPath = ytDlpPath
      },
      bundledOnly: isVendoredYtDlpBuild(resources),
      bundledNodePath,
      bundledYtDlpPath,
      kernelRoot,
      platform: process.platform,
      fetch: async () => {
        assert.fail('Vendored runtime must not fetch official updates')
      },
      runCommand: async (executable, args) => {
        commands.push(args)
        assert.deepEqual(args, ['--version'])
        return {
          stdout: executable === bundledNodePath ? 'v24.14.0' : '2026.08.19',
          stderr: ''
        }
      }
    })
    t.after(() => service.stop())

    assert.equal(await service.prepare(), true)
    assert.equal(activatedPath, bundledYtDlpPath)
    assert.equal(service.getStatus().source, 'bundled')
    assert.equal(service.getStatus().state, 'up-to-date')
    const timer = t.mock.method(globalThis, 'setTimeout')
    service.startBackgroundUpdates()
    await service.checkForUpdates()
    assert.equal(timer.mock.callCount(), 0)
    timer.mock.restore()
    assert.equal(commands.length, 2)
    assert.equal(await readFile(statePath, 'utf8'), state)
    assert.equal(await readFile(cachedPath, 'utf8'), 'test executable')

    await rm(bundledYtDlpPath)
    assert.equal(await service.prepare(), false)
    assert.equal(service.getStatus().state, 'unavailable')
    assert.equal(await readFile(statePath, 'utf8'), state)
  })
}

test('an ordinary build keeps using its managed kernel', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vidbee-stock-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal(isVendoredYtDlpBuild(root), false)
  const bundledYtDlpPath = join(root, 'yt-dlp_linux')
  const bundledNodePath = join(root, 'node')
  await writeFile(bundledYtDlpPath, 'stock executable', { mode: 0o755 })
  await writeFile(bundledNodePath, 'node executable', { mode: 0o755 })
  let activatedPath: string | undefined
  const service = new YtDlpKernelService({
    activate: ({ ytDlpPath }) => {
      activatedPath = ytDlpPath
    },
    bundledNodePath,
    bundledYtDlpPath,
    fetch,
    kernelRoot: join(root, 'kernel'),
    platform: process.platform,
    runCommand: async (executable) => ({
      stdout: executable === bundledNodePath ? 'v24.14.0' : '2026.08.19',
      stderr: ''
    })
  })
  t.after(() => service.stop())
  assert.equal(await service.prepare(), true)
  assert.notEqual(activatedPath, bundledYtDlpPath)
  assert.equal(service.getStatus().source, 'managed')
})
