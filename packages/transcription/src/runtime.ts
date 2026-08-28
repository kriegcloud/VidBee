import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicWriteJson } from './atomic-file'

export type WorkerRuntimeLayer = 'env' | 'bundled' | 'system' | 'electron'

export const MIN_NODE_MAJOR = 18
export const DEFAULT_MAX_WORKER_RESTARTS = 2

export interface WorkerRuntime {
  execPath: string
  layer: WorkerRuntimeLayer
  version: string
  guarded: boolean
}

export interface ProbeCache {
  get: (key: string) => boolean | undefined
  set: (key: string, ok: boolean) => void
}

export interface ResolveWorkerRuntimeInput {
  envPath?: string | null
  bundledPath?: string | null
  systemPaths?: string[]
  electronPath?: string
  forceLayer?: WorkerRuntimeLayer | null
  minNodeMajor?: number
  probe?: (runtime: WorkerRuntime) => Promise<boolean>
  cache?: ProbeCache
  lookUpSystem?: boolean
}

export const isElectronBinary = (bin: string): boolean => /Electron/i.test(bin)

export const nodeBinaryName = (platform = process.platform): string =>
  platform === 'win32' ? 'node.exe' : 'node'

export const readNodeVersion = (bin: string): string => {
  try {
    const out = execFileSync(bin, ['-v'], {
      encoding: 'utf8',
      timeout: 8000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
    return out.trim().replace(/^v/, '')
  } catch {
    return ''
  }
}

export const nodeVersionMeetsBaseline = (version: string, minMajor = MIN_NODE_MAJOR): boolean => {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10)
  return Number.isFinite(major) && major >= minMajor
}

export const probeCacheKey = (execPath: string): string => {
  try {
    return `${execPath}:${statSync(execPath).mtimeMs}`
  } catch {
    return `${execPath}:missing`
  }
}

export const createFileProbeCache = (
  filePath = join(tmpdir(), 'vidbee-runtime-probe.json')
): ProbeCache => {
  const load = (): Record<string, boolean> => {
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, boolean>
    } catch {
      return {}
    }
  }
  return {
    get: (key) => load()[key],
    set: (key, ok) => {
      const next = { ...load(), [key]: ok }
      atomicWriteJson(filePath, next)
    }
  }
}

export const resolveBundledNodePath = (resourceDirs: string[] = []): string | null => {
  const name = nodeBinaryName()
  const extras = [
    process.env.VIDBEE_BUNDLED_NODE,
    ...resourceDirs.map((dir) => join(dir, 'node', name)),
    join(process.cwd(), 'resources', 'node', name)
  ]
  const electronResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof electronResourcesPath === 'string' && electronResourcesPath.length > 0) {
    extras.push(
      join(electronResourcesPath, 'resources', 'node', name),
      join(electronResourcesPath, 'node', name)
    )
  }
  return extras.find((value): value is string => Boolean(value && existsSync(value))) ?? null
}

const whichNode = (): string | null => {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], {
      encoding: 'utf8',
      timeout: 5000
    })
    const first = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)
    return first && existsSync(first) && !isElectronBinary(first) ? first : null
  } catch {
    return null
  }
}

export const resolveSystemNodePaths = (): string[] => {
  const found = [
    whichNode(),
    process.platform === 'darwin' ? '/opt/homebrew/bin/node' : null,
    '/usr/local/bin/node',
    process.platform === 'win32' ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe') : null
  ].filter((value): value is string => Boolean(value && existsSync(value) && !isElectronBinary(value)))
  return [...new Set(found)]
}

const usable = (
  execPath: string | null | undefined,
  layer: WorkerRuntimeLayer,
  minMajor: number
): WorkerRuntime | null => {
  if (!(execPath && existsSync(execPath))) {
    return null
  }
  if (layer !== 'electron' && isElectronBinary(execPath)) {
    return null
  }
  const version = readNodeVersion(execPath)
  if (layer !== 'electron' && !nodeVersionMeetsBaseline(version, minMajor)) {
    return null
  }
  return {
    execPath,
    layer,
    version: version || 'unknown',
    guarded: layer === 'electron'
  }
}

export async function resolveWorkerRuntime(
  input: ResolveWorkerRuntimeInput = {}
): Promise<WorkerRuntime> {
  const minMajor = input.minNodeMajor ?? MIN_NODE_MAJOR
  const force =
    input.forceLayer ??
    (process.env.VIDBEE_TRANSCRIPTION_FORCE_LAYER as WorkerRuntimeLayer | undefined) ??
    null
  const electronPath = input.electronPath ?? process.execPath
  const ordered: Array<{ layer: WorkerRuntimeLayer; path: string | null }> = [
    { layer: 'env', path: input.envPath ?? process.env.VIDBEE_TRANSCRIPTION_NODE ?? null },
    { layer: 'bundled', path: input.bundledPath ?? resolveBundledNodePath() },
    ...(input.lookUpSystem === false
      ? []
      : (input.systemPaths ?? resolveSystemNodePaths()).map((path) => ({
          layer: 'system' as const,
          path
        }))),
    { layer: 'electron', path: electronPath }
  ]

  const candidates = (force ? ordered.filter((item) => item.layer === force) : ordered)
    .map((item) => usable(item.path, item.layer, minMajor))
    .filter((item): item is WorkerRuntime => item !== null)

  if (candidates.length === 0) {
    const fallback = usable(electronPath, 'electron', minMajor)
    if (!fallback) {
      throw new Error('no usable transcription worker runtime')
    }
    return fallback
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const runtime = candidates[i]
    if (!runtime) {
      continue
    }
    const last = i === candidates.length - 1
    if (!input.probe) {
      return runtime
    }
    const key = probeCacheKey(runtime.execPath)
    const cached = input.cache?.get(key)
    if (cached === true) {
      return runtime
    }
    if (cached === false && !last) {
      continue
    }
    let ok = false
    if (cached === undefined) {
      try {
        ok = await input.probe(runtime)
      } catch {
        ok = false
      }
      input.cache?.set(key, ok)
    }
    if (ok || last) {
      return runtime
    }
  }

  const fallbackRuntime = candidates.at(-1)
  if (!fallbackRuntime) {
    throw new Error('no usable transcription worker runtime')
  }
  return fallbackRuntime
}

/** Sync ladder without probe — used by hosts that only need a path. */
export function resolveWorkerExecPath(preferred?: string): string {
  if (preferred && existsSync(preferred) && !isElectronBinary(preferred)) {
    return preferred
  }
  const env = process.env.VIDBEE_TRANSCRIPTION_NODE
  if (env && existsSync(env) && !isElectronBinary(env)) {
    return env
  }
  const bundled = resolveBundledNodePath()
  if (bundled) {
    return bundled
  }
  const system = resolveSystemNodePaths()[0]
  if (system) {
    return system
  }
  return preferred ?? process.execPath
}

export const probeWorker = async (input: {
  execPath: string
  workerScript: string
  modelsDir: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}): Promise<boolean> => {
  const timeoutMs = input.timeoutMs ?? 120_000
  return new Promise((resolve) => {
    const child = execFile(
      input.execPath,
      [input.workerScript],
      {
        env: input.env,
        timeout: timeoutMs
      },
      () => {
        /* close handled below */
      }
    )
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) {
        return
      }
      settled = true
      if (!child.killed) {
        child.kill('SIGTERM')
      }
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    child.stdout?.setEncoding('utf8')
    let buffer = ''
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.includes('"type":"probe-ok"')) {
        clearTimeout(timer)
        finish(true)
      } else if (buffer.includes('"type":"error"')) {
        clearTimeout(timer)
        finish(false)
      }
    })
    child.on('error', () => {
      clearTimeout(timer)
      finish(false)
    })
    child.on('close', () => {
      clearTimeout(timer)
      finish(false)
    })
    child.stdin?.write(`${JSON.stringify({ type: 'probe', modelsDir: input.modelsDir })}\n`)
    child.stdin?.end()
  })
}

export const formatRuntimeLog = (runtime: WorkerRuntime, restarts = 0): string[] => [
  `runtime.path=${runtime.execPath}`,
  `runtime.version=${runtime.version}`,
  `runtime.layer=${runtime.layer}`,
  `runtime.restarts=${restarts}`
]
