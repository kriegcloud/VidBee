import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

export class SourceImportError extends Error {}
const compiled = Object.create(null)
export const root = fileURLToPath(new URL('../../', import.meta.url))
// Execute the actual source, replacing only named host boundaries. No copied algorithms.
// Separate caches make import-time initialization repeatable without touching a real profile.
export function sourceLoader(overrides = {}) {
  const cache = Object.create(null)
  // Node modules share a realm, while their CommonJS bindings remain local.
  // Keep one realm per loader, rather than allocating one for every dependency.
  const realm = vm.createContext({ Error, TypeError, RangeError, SyntaxError,
    console: overrides.$console ?? console, Buffer, URL, navigator: overrides.$navigator,
    Date: overrides.$Date ?? Date, Intl: overrides.$Intl ?? Intl, __glob: overrides.$glob, AbortController,
    fetch: overrides.$fetch, process: overrides.$process ?? process, window: overrides.$window,
    setTimeout: overrides.$setTimeout ?? setTimeout, clearTimeout, setInterval, clearInterval })
  function load(relative) {
    const filename = path.resolve(root, relative)
    if (cache[filename]) return cache[filename].exports
    overrides.$onLoad?.(path.relative(root,filename))
    const module = { exports: {} }
    cache[filename] = module
    const nativeRequire = createRequire(filename)
    const require = (id) => {
      if (Object.hasOwn(overrides, id)) return overrides[id]
      if (overrides.$require) { const result = overrides.$require(id, filename); if (result !== undefined) return result }
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), id)
        const resolved = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')]
          .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
        if (!resolved) throw new SourceImportError(`Unresolved source import ${id}`)
        return load(resolved)
      }
      if (id.startsWith('@shared/')) { const base=path.join(root,'apps/desktop/src/shared',id.slice(8));return load(fs.existsSync(base+'.ts')?base+'.ts':path.join(base,'index.ts')) }
      return nativeRequire(id)
    }
    const original = fs.readFileSync(filename, 'utf8')
    const source = overrides.$transform ? overrides.$transform(original, path.relative(root, filename)) : original
    const code = compiled[filename]?.source === source ? compiled[filename].code : transformSync(source, {
      loader: filename.endsWith('.tsx') ? 'tsx' : filename.endsWith('.ts') ? 'ts' : 'js',
      format: 'cjs', target: 'node22', jsx: 'automatic', define: { 'import.meta.dirname': JSON.stringify(path.dirname(filename)), 'import.meta.glob': '__glob' }, tsconfigRaw: { compilerOptions: { experimentalDecorators: true } }
    }).code
    compiled[filename] = { source, code }
    const evaluate = vm.runInContext(`(function(module, exports, require, __dirname) {\n${code}\n})`, realm,
      { filename, importModuleDynamically: overrides.$import })
    evaluate(module, module.exports, require, path.dirname(filename))
    return module.exports
  }
  // Test factories can create promises in the very same realm as both implementations.
  Object.defineProperty(load, 'inRealm', { value: expression => vm.runInContext(expression, realm) })
  return load
}

export function settingsHarness(directory, options = {}) {
  const trace = []
  const electron = { app: { getPath: () => { if (options.failPath) throw new Error('injected path'); if (options.pathFailures > 0) { options.pathFailures--; throw new Error('injected path') } return directory }, getVersion: () => '2.4.0',
    getPreferredSystemLanguages: () => ['ja-JP'], getLocale: () => 'ja',
    getLocaleCountryCode: () => 'JP' }, ipcMain: { on() {} } }
  const storeLoad = sourceLoader({ electron })
  const Store = storeLoad('node_modules/electron-store/index.js').default
  class ObservedStore extends Store {
    set(key, value) {
      trace.push(['write', key, value])
      if (options.failObject && typeof key === 'object') { options.lastFailure = new Error('injected object write'); throw options.lastFailure }
      if (options.failKey === key) { options.lastFailure = new Error(`injected write ${key}`); throw options.lastFailure }
      return super.set(key, value)
    }
    clear() {
      trace.push(['clear'])
      if (options.failClear) { options.lastFailure = new Error('injected clear'); throw options.lastFailure }
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
  const log = { error: (...args) => trace.push(['error', ...args.map(value => value instanceof Error ? { name: value.name, message: value.message } : value)]),
    info: (...args) => trace.push(['info', ...args]) }
  const load = sourceLoader({ electron, 'electron-store': ObservedStore,
    'node:fs': fakeFs, 'node:os': { homedir: () => '/synthetic/home' },
    '@vidbee/i18n/legacy/system-locale': { detectSystemProfile: input => storeLoad('packages/i18n/src/legacy/system-locale.ts').detectSystemProfile({ ...input, env: {}, timeZone: 'Asia/Tokyo' }) },
    './portable': portable, './utils/logger': { scopedLoggers: { system: log } } })
  const manager = load('apps/desktop/src/main/settings.ts').settingsManager
  return { manager, trace, options, load, raw: () => JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8')) }
}
