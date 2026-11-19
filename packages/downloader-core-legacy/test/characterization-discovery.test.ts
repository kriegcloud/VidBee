import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  existing: [] as string[], directories: [] as string[],
  commands: {} as Record<string, string>, failures: [] as string[],
  calls: [] as unknown[][], writes: [] as unknown[][], chmod: [] as unknown[][],
  constructors: [] as string[], chmodFails: false
}))
vi.mock('node:child_process', async (original) => {
  const real = await original<typeof import('node:child_process')>()
  return { ...real, execSync: (command: string, options: unknown) => {
    host.calls.push([command, options])
    if (host.failures.includes(command)) throw { host: 'opaque shell failure' }
    return Buffer.from(host.commands[command] ?? '')
  } }
})
vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>()
  const mocked = {
    existsSync: (file: string) => host.existing.includes(String(file)),
    mkdirSync: (...args: unknown[]) => { host.writes.push(args) },
    chmodSync: (...args: unknown[]) => { host.chmod.push(args); if (host.chmodFails) throw new Error('EACCES: executable mode') },
    statSync: (file: string) => ({ isDirectory: () => host.directories.includes(String(file)) })
  }
  return { ...real, ...mocked, default: { ...real, ...mocked } }
})
vi.mock('yt-dlp-wrap-plus', () => ({ default: class Wrapper {
  constructor(binary: string) { host.constructors.push(binary) }
} }))
import { DownloaderCore } from '@vidbee/downloader-core-legacy'

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
beforeEach(() => {
  vi.spyOn(process, 'cwd').mockReturnValue('/fixture/worktree')
  vi.stubEnv('YTDLP_PATH', ''); vi.stubEnv('FFMPEG_PATH', ''); vi.stubEnv('YTDLP_JS_RUNTIME', 'none')
  vi.stubEnv('YTDLP_JS_RUNTIME_PATH', ''); vi.stubEnv('NODE_ENV', 'production')
})
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  host.existing = []; host.directories = []; host.commands = {}; host.failures = []
  host.calls = []; host.writes = []; host.chmod = []; host.constructors = []; host.chmodFails = false
})
const options = { stdio: ['ignore', 'pipe', 'ignore'] }
function platform(value: 'linux' | 'win32' | 'darwin') { Object.defineProperty(process, 'platform', { value, configurable: true }) }
function ffmpeg(directory: string, windows = false) {
  host.existing.push(`${directory}/ffmpeg${windows ? '.exe' : ''}`, `${directory}/ffprobe${windows ? '.exe' : ''}`)
}

it('public initialize gives existing env binaries precedence over bundled and shell, with synchronous prefix', async () => {
  platform('linux'); vi.stubEnv('YTDLP_PATH', ' /fixture/env/yt-dlp '); vi.stubEnv('FFMPEG_PATH', '/fixture/env/tools')
  host.existing.push('/fixture/env/yt-dlp', '/fixture/env/tools', '/fixture/worktree/resources/yt-dlp_linux')
  host.directories.push('/fixture/env/tools'); ffmpeg('/fixture/env/tools')
  const pending = new DownloaderCore({ downloadDir: '/fixture/downloads' }).initialize()
  expect(host.writes).toEqual([['/fixture/downloads', { recursive: true }]])
  expect(host.constructors).toEqual(['/fixture/env/yt-dlp'])
  expect(process.env.FFMPEG_PATH).toBe('/fixture/env/tools'); expect(host.calls).toEqual([])
  await pending
})
it.each([
  ['linux', 'yt-dlp_linux'], ['darwin', 'yt-dlp_macos'], ['win32', 'yt-dlp.exe']
] as const)('bundled %s beats shell after missing env; sibling ffmpeg and chmod failure policy', async (os, binary) => {
  platform(os); vi.stubEnv('YTDLP_PATH', '/fixture/missing-env')
  const resource = '/fixture/worktree/resources'; const selected = `${resource}/${binary}`
  host.existing.push(selected); ffmpeg(`${resource}/ffmpeg`, os === 'win32'); host.chmodFails = true
  await new DownloaderCore({ downloadDir: '/fixture/downloads' }).initialize()
  expect(host.constructors).toEqual([selected]); expect(host.calls).toEqual([])
  expect(process.env.FFMPEG_PATH).toBe(`${resource}/ffmpeg`)
  expect(host.chmod).toEqual(os === 'win32' ? [] : [[selected, 0o755], [`${resource}/ffmpeg/ffmpeg`, 0o755], [`${resource}/ffmpeg/ffprobe`, 0o755]])
})
it.each(['linux', 'win32'] as const)('system discovery %s pins shell command, exact options and first nonempty stdout line', async (os) => {
  platform(os); const lookup = os === 'win32' ? 'where' : 'which'
  host.commands[`${lookup} yt-dlp`] = ' \n /fixture/system/yt-dlp \n /fixture/ignored/yt-dlp\n'
  host.commands[`${lookup} ffmpeg`] = ' \n /fixture/tools/ffmpeg \n /fixture/ignored/ffmpeg\n'
  ffmpeg('/fixture/tools', os === 'win32')
  await new DownloaderCore({ downloadDir: '/fixture/downloads' }).initialize()
  // No env, cwd, shell or timeout option is supplied: Node's live inheritance is retained.
  expect(host.calls).toEqual([[`${lookup} yt-dlp`, options], [`${lookup} ffmpeg`, options]])
  expect(host.constructors).toEqual(['/fixture/system/yt-dlp'])
  expect(process.env.FFMPEG_PATH).toBe('/fixture/tools')
})
it('env ffmpeg executable resolves its directory and suppresses system discovery', async () => {
  platform('linux'); vi.stubEnv('YTDLP_PATH', '/fixture/yt-dlp'); vi.stubEnv('FFMPEG_PATH', '/fixture/tools/ffmpeg')
  host.existing.push('/fixture/yt-dlp'); ffmpeg('/fixture/tools')
  await new DownloaderCore({ downloadDir: '/fixture/downloads' }).initialize()
  expect(process.env.FFMPEG_PATH).toBe('/fixture/tools'); expect(host.calls).toEqual([])
})
it('macOS common directory is considered after an empty system ffmpeg lookup', async () => {
  platform('darwin'); vi.stubEnv('YTDLP_PATH', '/fixture/yt-dlp'); host.existing.push('/fixture/yt-dlp'); ffmpeg('/opt/homebrew/bin')
  await new DownloaderCore({ downloadDir: '/fixture/downloads' }).initialize()
  expect(host.calls).toEqual([['which ffmpeg', options]]); expect(process.env.FFMPEG_PATH).toBe('/opt/homebrew/bin')
})
it.each(['empty-output', 'shell-failure'] as const)('public discovery failure %s preserves fixed Error after directory creation', async (failure) => {
  platform('linux'); if (failure === 'shell-failure') host.failures.push('which yt-dlp')
  const pending = new DownloaderCore({ downloadDir: '/fixture/downloads' }).initialize()
  expect(host.writes).toEqual([['/fixture/downloads', { recursive: true }]])
  await expect(pending).rejects.toThrowError(new Error('yt-dlp binary not found. Set YTDLP_PATH or install yt-dlp in PATH.'))
  expect(host.calls).toEqual([['which yt-dlp', options]]); expect(host.constructors).toEqual([])
})
it('failed ffmpeg lookup is swallowed and initialization still constructs yt-dlp', async () => {
  platform('linux'); vi.stubEnv('YTDLP_PATH', '/fixture/yt-dlp'); host.existing.push('/fixture/yt-dlp'); host.failures.push('which ffmpeg')
  await new DownloaderCore({ downloadDir: '/fixture/downloads' }).initialize()
  expect(host.calls).toEqual([['which ffmpeg', options]]); expect(host.constructors).toEqual(['/fixture/yt-dlp']); expect(process.env.FFMPEG_PATH).toBe('')
})
it('configured JS runtime uses the same shell observation before initialization discovery', async () => {
  platform('linux'); vi.stubEnv('YTDLP_JS_RUNTIME', 'node'); vi.stubEnv('YTDLP_PATH', '/fixture/yt-dlp'); host.existing.push('/fixture/yt-dlp')
  host.commands['which node'] = '\n /fixture/runtime/node \n /ignored/node\n'
  const core = new DownloaderCore({ downloadDir: '/fixture/downloads' })
  expect(host.calls).toEqual([['which node', options]])
  await core.initialize(); expect(host.calls).toEqual([['which node', options], ['which ffmpeg', options]])
})
