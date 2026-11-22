import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import vm from 'node:vm'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import * as Effect from 'effect/Effect'
import * as Result from 'effect/Result'
import { transformSync } from 'esbuild'

export class SourceImportError extends Error {}
const compiled = Object.create(null)
let settingsLogicLoader
const strictDefinitions = new Set(JSON.parse(fs.readFileSync(new NodeURL('../../apps/desktop/port-units.json', import.meta.url), 'utf8')).files.filter(row=>row.partition==='strict').map(row=>path.resolve(rootPath(),row.file)))
function rootPath(){return fileURLToPath(new NodeURL('../../',import.meta.url))}
export const root = fileURLToPath(new NodeURL('../../', import.meta.url))
// Execute the actual source, replacing only named host boundaries. No copied algorithms.
// Separate caches make import-time initialization repeatable without touching a real profile.
export function sourceLoader(overrides = {}) {
  const cache = Object.create(null)
  let fixtureDocument
  let foundationBridge
  let aboutActions
  const injectedSettings = injected => {
    if (!injected.settingsManager || injected.runSettings) return injected
    const manager=injected.settingsManager
    const attempt=body=>Effect.try({try:body,catch:error=>error})
    return {...injected,runSettings:operation=>{
      const result=Effect.runSync(Effect.result(operation({
        get:key=>attempt(()=>manager.get(key)),reset:attempt(()=>manager.reset()),
        setAll:entries=>attempt(()=>manager.setAll(Object.fromEntries(entries))),
        getAll:attempt(()=>manager.getAll())
      },{use:body=>body(),cleanup:()=>{}})))
      if(Result.isFailure(result)){const error=result.failure;throw error?._tag==='OriginalFailure'?error.original:error}
      return result.success
    }}
  }
  // Node modules share a realm, while their CommonJS bindings remain local.
  // Keep one realm per loader, rather than allocating one for every dependency.
  const realm = vm.createContext({ Error, TypeError, RangeError, SyntaxError,
    console: overrides.$console ?? console, Buffer, URL, navigator: overrides.$navigator,
    Date: overrides.$Date ?? Date, Intl: overrides.$Intl ?? Intl, __glob: overrides.$glob, AbortController,
    fetch: overrides.$fetch, process: overrides.$process ?? process, window: overrides.$window,
    queueMicrotask, setTimeout: overrides.$setTimeout ?? setTimeout, clearTimeout, setInterval, clearInterval })
  // Public characterization entry requests keep their legacy API contract while
  // production imports resolve the strict implementation at the original path.
  function load(relative, dependency = false) {
    if (!dependency) {
      if(relative==='apps/desktop/src/renderer/src/pages/Settings.tsx'){
        const {SettingsScreen}=load('apps/desktop/src/renderer/src/pages/SettingsScreen.tsx',true)
        const {settingsPanels}=load('apps/desktop/src/renderer/src/legacy/SettingsPanels.tsx',true)
        return {Settings:()=>SettingsScreen({panels:settingsPanels})}
      }
      if (relative === 'apps/desktop/src/main/settings.ts') relative = 'apps/desktop/src/main/legacy/settings.ts'
      for (const capability of ['app', 'settings', 'window']) {
        if (relative === `apps/desktop/src/main/ipc/services/${capability}-service.ts`) relative = `apps/desktop/src/main/legacy/${capability}-service.ts`
      }
    }
    const filename = path.resolve(root, relative)
    if(filename.endsWith('.json'))return JSON.parse(fs.readFileSync(filename,'utf8'))
    if (cache[filename]) return cache[filename].exports
    overrides.$onLoad?.(path.relative(root,filename))
    const module = { exports: {} }
    cache[filename] = module
    const nativeRequire = createRequire(filename)
    const require = (id) => {
      if (id === 'electron' && filename.endsWith('/src/preload/index.ts') && overrides.electron?.contextBridge && !overrides.$includeFoundationBridge) {
        const injected=overrides.electron
        return {...injected,contextBridge:{...injected.contextBridge,exposeInMainWorld:(key,value)=>{
          // Historical snapshots own the former surface. Keep the new bridge
          // available to its separate acquisition probe without changing that surface.
          if(key==='vidbeeRpc'){foundationBridge=value;return}
          return injected.contextBridge.exposeInMainWorld(key,value)
        }}}
      }
      if (Object.hasOwn(overrides, id)) return overrides[id]
      if (filename.includes('/renderer/') && /(?:lib\/)?foundation$/.test(id)) {
        const former = id.replace(/foundation$/, 'ipc')
        const injected = overrides[former] ?? overrides['@renderer/lib/ipc']
        if (injected) return {foundationClients:injected.ipcServices,
          loadFoundationAppInfo:()=>{
            fixtureDocument ??= {registry:AtomRegistry.make(),atoms:load('apps/desktop/src/renderer/src/runtime/Foundation.atoms.ts',true).makeFoundationAtoms()}
            aboutActions ??= Effect.runSync(load('apps/desktop/src/renderer/src/runtime/About.atoms.ts',true).makeAboutActions({
              registry:fixtureDocument.registry,atoms:fixtureDocument.atoms,storage:{write:(atom,value)=>fixtureDocument.registry.set(atom,value)},
              calls:{getVersion:Effect.tryPromise({try:()=>injected.ipcServices.app.getVersion(),catch:error=>error}),getOsVersion:Effect.tryPromise({try:()=>injected.ipcServices.app.getOsVersion(),catch:error=>error})},
              report:(message,error)=>Effect.sync(()=>overrides['../../lib/logger'].logger.error(message,error))
            }))
            return Effect.runPromise(aboutActions.load)
          },
          foundationEffects:()=>({settings:{
            getAll:Effect.tryPromise({try:()=>injected.ipcServices.settings.getAll(),catch:error=>error}),
            set:(key,value)=>Effect.tryPromise({try:()=>injected.ipcServices.settings.set(key,value),catch:error=>error}),
            setAll:entries=>Effect.tryPromise({try:()=>injected.ipcServices.settings.setAll(Object.fromEntries(entries)),catch:error=>error})
          }}),
          runFoundationEffect:effect=>Effect.runPromise(effect),
          foundationEvents:injected.ipcEvents ?? {
          on:(channel,fn)=>overrides.$window?.api?.on(channel,fn),
          removeListener:(channel,fn)=>overrides.$window?.api?.removeListener(channel,fn)
        }}
      }
      if (filename.includes('/renderer/') && /foundation-state$/.test(id) && overrides.jotai?.atom) {
        fixtureDocument ??= {registry:AtomRegistry.make(),atoms:load('apps/desktop/src/renderer/src/runtime/Foundation.atoms.ts',true).makeFoundationAtoms()}
        return {projectFoundationAtom:source=>overrides.jotai.atom(fixtureDocument.registry.get(source))}
      }
      if (filename.includes('/renderer/') && /legacy\/document$/.test(id) && (overrides['../lib/ipc'] || overrides.$require)) {
        fixtureDocument ??= { registry:AtomRegistry.make(), atoms:load('apps/desktop/src/renderer/src/runtime/Foundation.atoms.ts',true).makeFoundationAtoms() }
        fixtureDocument.storage ??= {write:(atom,value)=>fixtureDocument.registry.set(atom,value),retain:()=>()=>{},capture:(atom,value)=>({release:()=>{},restore:()=>fixtureDocument.registry.set(atom,value)})}
        return {getDesktopDocument:()=>fixtureDocument}
      }
      if (filename.endsWith('/main/index.ts') && (id === './legacy/foundation-boot' || id === './legacy/foundation-windows' || id === './legacy/foundation-events') && overrides.$require) {
        const injected=overrides.$require(id,filename)
        if (injected !== undefined) return {startFoundationTransport:()=>{}, registerFoundationWindow:()=>{},publishFoundationKernel:()=>{}}
      }

      if (filename.includes('/main/legacy/')) {
        if (id === './registrar' && !overrides.electron?.ipcMain && overrides['electron-ipc-decorator']) return {registerLegacy:()=>{}}

        const former = id === './settings' ? '../../settings' :
          id.replace(/^\.\.\/(lib|utils)\//, '../../$1/')
        if (former !== id && Object.hasOwn(overrides, former)) return id==='./settings'?injectedSettings(overrides[former]):overrides[former]
      }
      if (filename.endsWith('/main/ipc/index.ts') && /\.\.\/legacy\/(app|settings|window)-service$/.test(id) && overrides.$require) {
        const result = overrides.$require(id.replace('../legacy/', './services/'), filename)
        if (result !== undefined) {
          const name = /\/(app|settings|window)-service$/.exec(id)[1]
          return { [name[0].toUpperCase()+name.slice(1)+'Service']: class {} }
        }
      }
      const legacySettings = id.replace('/legacy/settings', '/settings').replace(/settings\.compatibility$/, 'settings')
      if (legacySettings !== id && Object.hasOwn(overrides, legacySettings)) {
        return injectedSettings(overrides[legacySettings])
      }
      if (filename.endsWith('/main/legacy/settings.ts')) {
        const former = { '../portable': './portable', '../utils/logger': './utils/logger', '../lib/system-locale': './lib/system-locale' }[id]
        if (former && Object.hasOwn(overrides, former)) return overrides[former]
      }
      if (id === '@vidbee/schema/LiteralKit') return load('packages/schema/src/LiteralKit/index.ts', true)
      if (id === '@vidbee/identity/packages') return load('packages/identity/src/packages.ts', true)
      if (overrides.$require && !filename.includes('/packages/identity/src/') && !filename.includes('/packages/schema/src/')) { const result = overrides.$require(id, filename); if (result !== undefined) return result }
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), id)
        const resolved = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')]
          .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
        if (!resolved) throw new SourceImportError(`Unresolved source import ${id}`)
        // Strict settings modules export pure constructors and schema/service identities.
        // Reuse those definitions across profile fixtures, while each facade still owns
        // a freshly constructed driver, runtime, store and native overrides.
        if ((filename.endsWith('/main/legacy/settings.ts') || filename.endsWith('/main/legacy/foundation-runtime.ts') || filename.endsWith('/main/legacy/foundation-events.ts')) && !overrides.$transform && strictDefinitions.has(resolved) && !resolved.endsWith('/runtime/LegacyEffect.entry.ts')) {
          settingsLogicLoader ??= sourceLoader()
          return settingsLogicLoader(resolved, true)
        }
        return load(resolved, true)
      }
      if (id.startsWith('@shared/')) { const base=path.join(root,'apps/desktop/src/shared',id.slice(8));return load(fs.existsSync(base+'.ts')?base+'.ts':path.join(base,'index.ts'), true) }
      if (id.startsWith('@vidbee/') && !id.includes('-legacy') && !id.includes('/legacy')) {
        const resolved=nativeRequire.resolve(id)
        if (resolved.endsWith('.ts')) return load(resolved,true)
      }
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
  Object.defineProperty(load, 'foundationBridge', {get:()=>foundationBridge})
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
