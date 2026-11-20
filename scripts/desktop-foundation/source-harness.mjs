import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const compiled = Object.create(null)
export const root = fileURLToPath(new URL('../../', import.meta.url))
// Execute the actual source, replacing only named host boundaries. No copied algorithms.
// Separate caches make import-time initialization repeatable without touching a real profile.
export function sourceLoader(overrides = {}) {
  const cache = Object.create(null)
  function load(relative) {
    const filename = path.resolve(root, relative)
    if (cache[filename]) return cache[filename].exports
    const module = { exports: {} }
    cache[filename] = module
    const nativeRequire = createRequire(filename)
    const require = (id) => {
      if (Object.hasOwn(overrides, id)) return overrides[id]
      if (overrides.$require) { const result = overrides.$require(id); if (result !== undefined) return result }
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), id)
        const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')]
          .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
        if (!resolved) throw new Error(`Unresolved source import ${id}`)
        return load(resolved)
      }
      if (id.startsWith('@shared/')) return load(path.join(root, 'apps/desktop/src/shared', id.slice(8)) + '.ts')
      return nativeRequire(id)
    }
    const source = fs.readFileSync(filename, 'utf8')
    const code = compiled[filename]?.source === source ? compiled[filename].code : transformSync(source, {
      loader: filename.endsWith('.tsx') ? 'tsx' : filename.endsWith('.ts') ? 'ts' : 'js',
      format: 'cjs', target: 'node22', define: { 'import.meta.dirname': JSON.stringify(path.dirname(filename)) }, tsconfigRaw: { compilerOptions: { experimentalDecorators: true } }
    }).code
    compiled[filename] = { source, code }
    const context = { module, exports: module.exports, require, console, Buffer, URL,
      __dirname: path.dirname(filename), AbortController,
      process: overrides.$process ?? process, window: overrides.$window, setTimeout, clearTimeout, setInterval, clearInterval }
    vm.runInNewContext(code, context, { filename, importModuleDynamically: overrides.$import })
    return module.exports
  }
  return load
}

export function settingsHarness(directory, options = {}) {
  const trace = []
  const electron = { app: { getPath: () => directory, getVersion: () => '2.4.0',
    getPreferredSystemLanguages: () => ['ja-JP'], getLocale: () => 'ja',
    getLocaleCountryCode: () => 'JP' }, ipcMain: { on() {} } }
  const storeLoad = sourceLoader({ electron })
  const Store = storeLoad('node_modules/electron-store/index.js').default
  class ObservedStore extends Store {
    set(key, value) {
      trace.push(['write', key, value])
      if (options.failObject && typeof key === 'object') throw new Error('injected object write')
      if (options.failKey === key) throw new Error(`injected write ${key}`)
      return super.set(key, value)
    }
    clear() {
      trace.push(['clear'])
      if (options.failClear) throw new Error('injected clear')
      return super.clear()
    }
  }
  const portable = { isPortableMode: Boolean(options.portable), portableRoot: '/portable/new',
    previousPortableRoot: '/portable/old', getPortableDownloadsPath: () => '/portable/new/Downloads',
    rememberPortableRoot: () => trace.push(['marker']) }
  const fakeFs = { ...fs, mkdirSync: (value) => {
    trace.push(['mkdir', value])
    if (options.failMkdir) throw new Error('injected mkdir')
  } }
  const log = { error: (message) => trace.push(['error', message]),
    info: (message) => trace.push(['info', message]) }
  const load = sourceLoader({ electron, 'electron-store': ObservedStore,
    'node:fs': fakeFs, 'node:os': { homedir: () => '/synthetic/home' },
    './portable': portable, './utils/logger': { scopedLoggers: { system: log } } })
  const manager = load('apps/desktop/src/main/settings.ts').settingsManager
  return { manager, trace, options, load, raw: () => JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8')) }
}
