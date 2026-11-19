import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import {
  isBrowserCaptureAvailable,
  resolveBrowserExecutable,
  resolveXvfbPath
} from '@vidbee/browser-capture-legacy'

const probes = vi.hoisted(() => ({
  calls: [] as unknown[][],
  paths: [] as string[],
  commands: {} as Record<string, string>,
  status: 0,
  throwSpawn: false,
  throwPath: ''
}))

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>()
  return {
    ...original,
    existsSync: (file: unknown) => {
      const name = String(file)
      probes.calls.push(['exists', name])
      if (name === probes.throwPath) throw new Error('synthetic access failure')
      return probes.paths.includes(name)
    }
  }
})
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return {
    ...original,
    spawnSync: (command: string, args: string[], options: unknown) => {
      probes.calls.push(['spawnSync', command, args, options])
      if (probes.throwSpawn) throw new Error('synthetic spawn failure')
      return { stdout: probes.commands[args[0] ?? ''] ?? '', status: probes.status }
    }
  }
})

const which = (name: string) => ['spawnSync', 'which', [name], { encoding: 'utf8' }]
const browserMiss = [
  ['exists', '/usr/bin/brave'], ['exists', '/usr/bin/brave-browser'],
  ['exists', '/usr/bin/brave-browser-stable'], ['exists', '/opt/brave.com/brave/brave'],
  ['exists', '/opt/brave.com/brave/brave-browser'], which('brave'),
  ['exists', '/usr/bin/google-chrome-stable'], ['exists', '/usr/bin/google-chrome'],
  ['exists', '/usr/bin/chrome'], ['exists', '/opt/google/chrome/chrome'], which('chrome'),
  ['exists', '/usr/bin/chromium'], ['exists', '/usr/bin/chromium-browser'],
  ['exists', '/usr/lib/chromium/chromium'], which('chromium'),
  ['exists', '/usr/bin/microsoft-edge'], ['exists', '/usr/bin/microsoft-edge-stable'], which('edge'),
  which('google-chrome-stable'), which('google-chrome'), which('brave'), which('brave-browser'),
  which('chromium'), which('microsoft-edge')
]

beforeEach(() => {
  probes.calls.length = 0
  probes.paths = []
  probes.commands = {}
  probes.status = 0
  probes.throwSpawn = false
  probes.throwPath = ''
  vi.stubEnv('VIDBEE_BROWSER_CAPTURE', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('public synchronous availability characterization', () => {
  it('pins every fixed path, browser-family probe and repeated fallback probe on a miss', () => {
    expect(resolveBrowserExecutable()).toBeNull()
    expect(probes.calls).toEqual(browserMiss)
  })

  it('prefers a fixed browser path without requiring executable permissions or invoking which', () => {
    probes.paths = ['/usr/bin/brave-browser', '/usr/bin/google-chrome-stable']
    expect(resolveBrowserExecutable()).toBe('/usr/bin/brave-browser')
    expect(probes.calls).toEqual([
      ['exists', '/usr/bin/brave'], ['exists', '/usr/bin/brave-browser']
    ])
  })

  it('pins preferred family ordering and eliminates only the first-phase duplicate', () => {
    expect(resolveBrowserExecutable('chrome:Default')).toBeNull()
    const chromeStart = browserMiss.slice(6, 11)
    expect(probes.calls).toEqual([...chromeStart, ...browserMiss.slice(0, 6), ...browserMiss.slice(11)])
  })

  it('accepts a preferred non-Chromium browser and first-line which output despite nonzero status', () => {
    probes.commands.firefox = '  /synthetic/firefox\r\n/ignored/second\n'
    probes.paths = ['/synthetic/firefox']
    probes.status = 9
    expect(resolveBrowserExecutable('firefox')).toBe('/synthetic/firefox')
    expect(probes.calls).toEqual([which('firefox'), ['exists', '/synthetic/firefox']])
  })

  it('pins Xvfb lookup trimming, missing-file rejection and spawn-error recovery', () => {
    probes.commands.Xvfb = ' /synthetic/Xvfb\n/ignored/Xvfb '
    expect(resolveXvfbPath()).toBeNull()
    expect(probes.calls).toEqual([which('Xvfb'), ['exists', '/synthetic/Xvfb']])
    probes.calls.length = 0
    probes.paths = ['/synthetic/Xvfb']
    expect(resolveXvfbPath()).toBe('/synthetic/Xvfb')
    expect(probes.calls).toEqual([which('Xvfb'), ['exists', '/synthetic/Xvfb']])
    probes.calls.length = 0
    probes.throwSpawn = true
    expect(resolveXvfbPath()).toBeNull()
    expect(probes.calls).toEqual([which('Xvfb')])
  })

  it('swallows which-result access failures but propagates fixed-candidate access failures', () => {
    probes.commands.Xvfb = '/synthetic/denied'
    probes.throwPath = '/synthetic/denied'
    expect(resolveXvfbPath()).toBeNull()
    expect(probes.calls).toEqual([which('Xvfb'), ['exists', '/synthetic/denied']])
    probes.calls.length = 0
    probes.throwPath = '/usr/bin/brave'
    expect(() => resolveBrowserExecutable()).toThrow('synthetic access failure')
    expect(probes.calls).toEqual([['exists', '/usr/bin/brave']])
  })

  it('short-circuits only the exact disabled environment value and then missing Xvfb', () => {
    vi.stubEnv('VIDBEE_BROWSER_CAPTURE', '0')
    expect(isBrowserCaptureAvailable()).toBe(false)
    expect(probes.calls).toEqual([])
    vi.stubEnv('VIDBEE_BROWSER_CAPTURE', 'false')
    expect(isBrowserCaptureAvailable()).toBe(false)
    expect(probes.calls).toEqual([which('Xvfb')])
  })

  it('returns false on non-Linux without filesystem or subprocess probes', () => {
    vi.stubGlobal('process', Object.create(process, { platform: { value: 'darwin' } }))
    expect(isBrowserCaptureAvailable()).toBe(false)
    expect(probes.calls).toEqual([])
  })

  it('requires Xvfb then a browser without checking ffmpeg, xdpyinfo, Pulse or Widevine', () => {
    probes.commands.Xvfb = '/synthetic/Xvfb'
    probes.paths = ['/synthetic/Xvfb', '/usr/bin/brave']
    expect(isBrowserCaptureAvailable()).toBe(true)
    expect(probes.calls).toEqual([
      which('Xvfb'), ['exists', '/synthetic/Xvfb'], ['exists', '/usr/bin/brave']
    ])
  })
})
