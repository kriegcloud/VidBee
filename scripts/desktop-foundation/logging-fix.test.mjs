import { describe, expect, it } from '@effect/vitest'
import { vi } from 'vitest'
import { inspect } from 'node:util'
import { EventEmitter } from 'node:events'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as References from 'effect/References'
import { sourceLoader } from './source-harness.mjs'
import { createPreloadLogger } from '../../apps/desktop/src/preload/logging/PreloadLogger.entry.ts'
import { createRendererLogger } from '../../apps/desktop/src/renderer/src/logging/RendererLogger.entry.ts'
import { createDesktopLogging, createDesktopLoggingWith } from '../../apps/desktop/src/main/logging/DesktopLogging.entry.ts'
import { receiveDesktopLog } from '../../apps/desktop/src/main/logging/ElectronLog.driver.ts'
import { OtlpConfiguration } from '../../apps/desktop/src/main/logging/Otlp.model.ts'
import { desktopLog } from '../../apps/desktop/src/shared/logging/DesktopLogger.layer.ts'
import { DesktopLogEntry, DesktopLogLevel } from '../../apps/desktop/src/shared/logging/DesktopLog.model.ts'
const host = vi.hoisted(() => ({ native: undefined, calls: [] }))
vi.mock('electron-log/main', () => ({ default: new Proxy({}, { get(_target, key) {
  if (key === 'scope') return scope => Object.fromEntries(['error','warn','info','verbose','debug','silly'].map(level => [level, (...args) => { host.calls.push({level,scope,args});host.native?.scope(scope)[level](...args) }]))
  return (...args) => { host.calls.push({level:key,scope:'',args});host.native?.[key](...args) }
} }) }))
import { encodeDesktopLog } from '../../apps/desktop/src/shared/logging/DesktopLogWire.driver.ts'
const turns = async () => { for(let n=0;n<50;n++) await Promise.resolve() }
function configuration(environment) {
  const consoleOutput=[], fileOutput=[], ipcOutput=[]
  const fakeFs={renameSync(){},mkdirSync(){},writeFileSync:(_file,text)=>fileOutput.push(text),statSync:()=>({size:0})}
  const load=sourceLoader({fs:fakeFs})
  const Logger=load('node_modules/electron-log/src/core/Logger.js'),Registry=load('node_modules/electron-log/src/node/transports/file/FileRegistry.js')
  const log=new Logger({logId:'fix1',isDev:environment==='development',variables:{processType:'browser'},dependencies:{registry:new Registry(),externalApi:{isElectron:()=>true,sendIpc:(_channel,message)=>ipcOutput.push(message),getPathVariables:()=>({libraryDefaultDir:'/synthetic/logs'})}},transportFactories:{console:load('node_modules/electron-log/src/node/transports/console.js'),file:load('node_modules/electron-log/src/node/transports/file/index.js'),ipc:load('node_modules/electron-log/src/node/transports/ipc.js')}})
  log.errorHandler={startCatching(){}}
  log.transports.console.useStyles=false;log.transports.console.writeFn=({message})=>consoleOutput.push(message)
  sourceLoader({electron:{ipcMain:new EventEmitter()},$process:{env:{NODE_ENV:environment}},'@vidbee/logger/legacy':{initVidbeeLogger(){}},'../logging/ElectronLog.driver':{electronLog:log,receiveDesktopLog},'../logging/DesktopLogging.entry':{createDesktopLogging:()=>({dispose:()=>Promise.resolve()})}})('apps/desktop/src/main/config/logger-config.ts').configureLogger()
  host.native=log;host.calls.length=0;consoleOutput.length=0;fileOutput.length=0;ipcOutput.length=0
  return {log,consoleOutput,fileOutput,ipcOutput}
}
for(const environment of ['development','production'])for(const [process, factory] of [['preload',createPreloadLogger],['renderer',createRendererLogger]]) {
  describe(`${process} real runtime, configured ${environment}`, () => {
    it('sends every corpus entry exactly once and preserves values, empty vectors and scope isolation', async () => {
      const outputs=configuration(environment);let attempts=0
      const runtime=factory(entry=>{attempts++;receiveDesktopLog(structuredClone(entry))})
      const nested=new Error('outer',{cause:new Error('inner')});const circular={label:'circular'};circular.self=circular
      const corpus=[[{object:{nested:[1,'two']}},nested], [circular], [undefined], [42n], []]
      try {
        expect(await runtime.runPromise(References.MinimumLogLevel)).toBe('All')
        for(const args of corpus)await runtime.runPromise(desktopLog(DesktopLogEntry.make({level:'info',scope:'',args})))
        expect(attempts).toBe(corpus.length);expect(host.calls).toHaveLength(corpus.length)
        for(let i=0;i<corpus.length;i++){expect(host.calls[i].scope).toBe('');expect(host.calls[i].args).toEqual(corpus[i])}
        expect(host.calls[0].args[1].cause.message).toBe('inner');expect(host.calls[1].args[0].self).toBe(host.calls[1].args[0])
        host.calls.length=0;outputs.consoleOutput.length=0;outputs.fileOutput.length=0;outputs.ipcOutput.length=0;attempts=0
        for(const level of DesktopLogLevel.literals)await runtime.runPromise(desktopLog(DesktopLogEntry.make({level,scope:'configured',args:[`probe:${level}`]})))
        expect(attempts).toBe(6);expect(host.calls.map(row=>row.level)).toEqual(DesktopLogLevel.literals)
        const emitted=environment==='development'?DesktopLogLevel.literals:['error','warn','info']
        expect(outputs.consoleOutput.map(message=>message.level)).toEqual(emitted)
        expect(outputs.fileOutput).toHaveLength(emitted.length)
        for(const level of emitted)expect(outputs.fileOutput.some(text=>text.includes(`probe:${level}`))).toBe(true)
        expect(outputs.ipcOutput.map(message=>message.level)).toEqual(environment==='development'?DesktopLogLevel.literals:[])
        host.calls.length=0
        await Promise.all(['one','two'].map(scope=>runtime.runPromise(desktopLog(DesktopLogEntry.make({level:'warn',scope,args:[scope]})))))
        await runtime.runPromise(Effect.logWarning('unscoped'))
        expect(host.calls.map(row=>row.scope)).toEqual(['one','two',''])
      } finally { await runtime.dispose();host.native=undefined }
    })
    it('attempts a closed bridge once, without retrying or leaking its error', async () => {
      host.calls.length=0;let attempts=0
      const runtime=factory(()=>{attempts++;throw Error('closed-canary')})
      try { await runtime.runPromise(Effect.logWarning('closed'));expect(attempts).toBe(1);expect(host.calls).toEqual([]) } finally {await runtime.dispose()}
    })
  })
}
it('observes the actual main runtime factory and keeps default-off minimum All', async () => {
  host.native=undefined;host.calls.length=0
  const runtime=createDesktopLogging(OtlpConfiguration.make({enabled:false,endpoint:'',version:''}))
  try {expect(await runtime.ready).toBe(true);expect(await runtime.runPromise(References.MinimumLogLevel)).toBe('All');await runtime.runPromise(Effect.logDebug('main-factory'));expect(host.calls).toHaveLength(1)}finally{await runtime.dispose()}
})
for(const failure of ['invalid-endpoint','acquisition'])it(`keeps the app logging after ${failure}, emits one sanitized diagnostic`, async () => {
  host.native=undefined;host.calls.length=0
  const canary='FIX1_ENDPOINT_HEADER_CANARY'
  const configuration=OtlpConfiguration.make({enabled:true,endpoint:`invalid://${canary}`,version:'test'})
  const consoleCalls=[];const spies=['log','warn','error'].map(method=>vi.spyOn(console,method).mockImplementation((...args)=>consoleCalls.push(args)))
  const runtime=failure==='invalid-endpoint'?createDesktopLogging(configuration):createDesktopLoggingWith(configuration,Layer.effectDiscard(Effect.die(new Error(`endpoint=${canary}; header=${canary}`))))
  try {
    expect(await runtime.ready).toBe(false)
    expect(host.calls).toHaveLength(1)
    expect(host.calls[0].args).toEqual(['Desktop telemetry initialization failed; continuing without telemetry.'])
    expect(JSON.stringify(host.calls)).not.toContain(canary)
    expect(inspect(consoleCalls, {depth: null})).not.toContain(canary)
    expect(consoleCalls).toEqual([])
    await runtime.runPromise(Effect.logInfo('app-still-running'))
    expect(host.calls.at(-1).args).toEqual(['app-still-running'])
  } finally {await runtime.dispose();for(const spy of spies)spy.mockRestore()}
})
for(const outcome of ['resolve','reject','timeout'])it(`prepares quit once with telemetry ${outcome}, then runs both cleanup listeners once`, async () => {
  vi.useFakeTimers()
  const trace=[];const app=new EventEmitter();let prepared,disposeCalls=0,otherCleanup=0,mainCleanup=0,quitCalls=0
  let release
  const pending=new Promise(resolve=>{release=resolve})
  const dispose=()=>{disposeCalls++;trace.push('telemetry');return outcome==='resolve'?Promise.resolve():outcome==='reject'?Promise.reject(Error('DISPOSAL_HEADER_CANARY')):pending}
  const log={warn:(...args)=>trace.push(['warn',...args]),info(){},transports:{console:{},file:{getFile:()=>({path:'/synthetic/main.log'})},ipc:{}},errorHandler:{startCatching(){}}}
  const load=sourceLoader({electron:{app:Object.assign(app,{getVersion:()=> 'test'}),ipcMain:new EventEmitter()},$process:{env:{NODE_ENV:'production',VIDBEE_OTLP_ENABLED:'1',VIDBEE_OTLP_ENDPOINT:'http://127.0.0.1/unused'}},'@vidbee/logger/legacy':{initVidbeeLogger(){}},'../logging/ElectronLog.driver':{electronLog:log,receiveDesktopLog(){}},'../logging/DesktopLogging.entry':{createDesktopLogging:()=>({dispose})},'../utils/logger':log,'./quit-confirmation-host':{allowAppQuit:()=>trace.push('allow')},'./ai-prompt-runner':{stopAllPromptRuns:()=>{trace.push('prompts');return Promise.resolve()}},'./agent-chat-runner':{stopAllAgentRuns:()=>{trace.push('agents');return Promise.resolve()}},'./task-queue-host':{stopDesktopInstagramProfileMappings:()=>{trace.push('mappings');return Promise.resolve()}}})
  const owner=load('apps/desktop/src/main/lib/app-quit.ts')
  load('apps/desktop/src/main/config/logger-config.ts').configureLogger()
  app.on('before-quit', event=>{if(!owner.isAppQuitPrepared()){event.preventDefault();if(!owner.isAppQuitting())prepared=owner.prepareAppQuit().then(()=>app.quit())}})
  app.on('will-quit',()=>{mainCleanup++});app.on('will-quit',()=>{otherCleanup++})
  app.quit=()=>{quitCalls++;let prevented=false;const event={preventDefault(){prevented=true}};app.emit('before-quit',event);if(!prevented)app.emit('will-quit',event)}
  try {
    app.quit();await turns();if(outcome==='timeout'){expect(otherCleanup).toBe(0);await vi.advanceTimersByTimeAsync(2001)}
    await prepared;await turns()
    expect(disposeCalls).toBe(1);expect(mainCleanup).toBe(1);expect(otherCleanup).toBe(1);expect(quitCalls).toBe(2)
    for(const step of ['allow','prompts','agents','mappings'])expect(trace.filter(value=>value===step)).toHaveLength(1)
    expect(trace.indexOf('telemetry')).toBeGreaterThan(trace.indexOf('mappings'))
    expect(JSON.stringify(trace)).not.toContain('DISPOSAL_HEADER_CANARY')
  } finally {release();vi.useRealTimers()}
})

it('validates graph references and preserves collision-shaped arguments and sparse arrays', () => {
  host.native=undefined;host.calls.length=0
  const sparse=[];sparse.length=3;sparse[2]='tail'
  const collision={format:'vidbee-log-graph/1',root:{_tag:'Reference',index:999},nodes:[]}
  const error=new Error('outer',{cause:new Error('inner')});error.cause.back=error
  const packet=encodeDesktopLog(DesktopLogEntry.make({level:'info',scope:'',args:[collision,sparse,error]}))
  receiveDesktopLog(structuredClone(packet))
  expect(host.calls).toHaveLength(1)
  const args=host.calls[0].args
  expect(args[0]).toEqual(collision);expect(args[1]).toHaveLength(3);expect(0 in args[1]).toBe(false);expect(args[1][2]).toBe('tail')
  expect(args[2].cause.message).toBe('inner');expect(args[2].cause.back).toBe(args[2])
  expect(Object.getOwnPropertyDescriptor(args[2],'cause').enumerable).toBe(false)
  host.calls.length=0
  for(const malformed of [{...packet,root:{_tag:'Reference',index:999}}, {...packet,nodes:[{_tag:'Array',length:0,fields:[['length',true,{_tag:'Value',value:1}]]}]}])expect(()=>receiveDesktopLog(malformed)).not.toThrow()
  expect(host.calls).toEqual([])
})
