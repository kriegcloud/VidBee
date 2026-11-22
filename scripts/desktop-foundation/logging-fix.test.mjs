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
import * as O from 'effect/Option'
import { DesktopLogBudgets } from '../../apps/desktop/src/shared/logging/DesktopLogWire.model.ts'
import { encodeDesktopLog, inspectDesktopLog, DesktopLogTruncation } from '../../apps/desktop/src/shared/logging/DesktopLogWire.driver.ts'
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
for(const outcome of ['off','resolve','reject','throw','timeout','repeat-quit','during-disposal','late-reject'])it(`actual quit callbacks keep exact order with telemetry ${outcome}`, async () => {
  vi.useFakeTimers()
  const trace=[],app=new EventEmitter(),ipcMain=new EventEmitter(),pending=Promise.withResolvers()
  let disposeCalls=0,otherCleanup=0,mainCleanup=0,quitCalls=0
  const dispose=()=>{disposeCalls++;trace.push('telemetry');if(outcome==='throw')throw Error('DISPOSAL_HEADER_CANARY');return outcome==='reject'?Promise.reject(Error('DISPOSAL_HEADER_CANARY')):['timeout','during-disposal','late-reject'].includes(outcome)?pending.promise:Promise.resolve()}
  const log={initialize(){},error(){},warn:(...args)=>trace.push(['warn',...args]),info(){},transports:{console:{},file:{getFile:()=>({path:'/synthetic/main.log'})},ipc:{}},errorHandler:{startCatching(){}}}
  const noop=()=>{}
  const overrides={electron:{app:Object.assign(app,{isPackaged:true,getVersion:()=> 'test',getPath:()=>'/synthetic/profile',setPath:noop,setName:noop,commandLine:{appendSwitch:noop},requestSingleInstanceLock:()=>true,whenReady:()=>new Promise(()=>{})}),ipcMain,protocol:{registerSchemesAsPrivileged:noop},BrowserWindow:{getAllWindows:()=>[]}},$process:{argv:['fixture'],platform:'linux',on:noop,env:{NODE_ENV:'production',VIDBEE_OTLP_ENABLED:outcome==='off'?'0':'1',VIDBEE_OTLP_ENDPOINT:'http://127.0.0.1/unused'}},'@vidbee/logger/legacy':{initVidbeeLogger(){}},'../logging/ElectronLog.driver':{electronLog:log,receiveDesktopLog(){}},'../logging/DesktopLogging.entry':{createDesktopLogging:()=>({dispose})},'../utils/logger':log,'./quit-confirmation-host':{allowAppQuit:()=>trace.push('allow')},'./ai-prompt-runner':{stopAllPromptRuns:()=>{trace.push('prompts');return Promise.resolve()}},'./agent-chat-runner':{stopAllAgentRuns:()=>{trace.push('agents');return Promise.resolve()}},'./task-queue-host':{stopDesktopInstagramProfileMappings:()=>{trace.push('mappings');return Promise.resolve()}}}
  const load=sourceLoader(overrides),owner=load('apps/desktop/src/main/lib/app-quit.ts')
  load('apps/desktop/src/main/config/logger-config.ts').configureLogger()
  Object.assign(overrides,{'./logging/ElectronLog.driver':{electronLog:log},'./config/logger-config':{configureLogger:noop},'./lib/app-quit':owner,'./lib/auth-client':{setupDesktopAuth:noop},'./lib/privileged-schemes':{installPrivilegedSchemeCollector:()=>noop},'./lib/ipc-coalescer':{createKeyedCoalescer:()=>({})},'./lib/quit-confirmation-host':{deferAppQuitIfNeeded:()=>false},'./lib/ytdlp-kernel-host':{stopYtDlpKernelService:()=>trace.push('kernel')},'./lib/download-facade':{downloadEngine:{on:noop,flushDownloadSession:()=>trace.push('session flush')}},'./lib/player-host':{stopPlayerHost:()=>trace.push('player')},'./lib/share-capture-window':{destroyShareCaptureWindow:()=>{mainCleanup++;trace.push('share window')}},'./tray':{destroyTray:()=>trace.push('tray')},'./local-api':{stopExtensionApiServer:()=>{trace.push('extension');return Promise.resolve()}},'./lib/subscriptions-host':{getDesktopSubscriptions:()=>({on:noop}),stopDesktopSubscriptions:()=>{trace.push('subscriptions');return Promise.resolve()}},$require:id=>id.startsWith('node:')||id.startsWith('@shared/')?undefined:{}})
  sourceLoader(overrides)('apps/desktop/src/main/index.ts')
  app.on('will-quit',()=>{otherCleanup++;trace.push('second cleanup')})
  app.quit=()=>{quitCalls++;let prevented=false;const event={preventDefault(){prevented=true}};app.emit('before-quit',event);if(!prevented)app.emit('will-quit',event)}
  try {
    app.quit()
    const preparation=owner.prepareAppQuit()
    expect(owner.prepareAppQuit()).toBe(preparation)
    if(outcome==='repeat-quit')app.quit()
    await turns()
    if(outcome==='during-disposal'){expect(disposeCalls).toBe(1);expect(mainCleanup).toBe(0);app.quit();expect(owner.prepareAppQuit()).toBe(preparation);pending.resolve()}
    if(['timeout','late-reject'].includes(outcome)){expect(otherCleanup).toBe(0);await vi.advanceTimersByTimeAsync(2001)}
    await preparation;await turns()
    if(outcome==='late-reject'){pending.reject(Error('LATE_REJECTION_CANARY'));await turns()}
    expect(disposeCalls).toBe(outcome==='off'?0:1);expect(mainCleanup).toBe(1);expect(otherCleanup).toBe(1);expect(quitCalls).toBe(['repeat-quit','during-disposal'].includes(outcome)?3:2)
    expect(trace.filter(value=>typeof value==='string')).toEqual(['allow','prompts','agents','mappings',...(outcome==='off'?[]:['telemetry']),'kernel','session flush','player','share window','tray','extension','subscriptions','second cleanup'])
    expect(JSON.stringify(trace)).not.toContain('DISPOSAL_HEADER_CANARY');expect(JSON.stringify(trace)).not.toContain('LATE_REJECTION_CANARY')
    if(outcome==='late-reject')expect(trace.filter(Array.isArray)).toEqual([['warn','Desktop telemetry shutdown timed out; continuing quit.'],['warn','Desktop telemetry shutdown failed; continuing quit.']])
  } finally {pending.resolve();vi.useRealTimers()}
})

it('validates graph references and preserves collision-shaped arguments and sparse arrays', () => {
  host.native=undefined;host.calls.length=0
  const sparse=[];sparse.length=3;sparse[2]='tail'
  const collision={format:'vidbee-log-graph/1',root:{_tag:'Reference',index:999},nodes:[]}
  const error=new TypeError('outer',{cause:new RangeError('inner')});error.stack='OUTER_COMPLETE_STACK\nframe-one\nframe-two';error.cause.stack='INNER_COMPLETE_STACK\nroot';error.cause.back=error
  const packet=encodeDesktopLog(DesktopLogEntry.make({level:'info',scope:'',args:[collision,sparse,error]}))
  receiveDesktopLog(structuredClone(packet))
  expect(host.calls).toHaveLength(1)
  const args=host.calls[0].args
  expect(args[0]).toEqual(collision);expect(args[1]).toHaveLength(3);expect(0 in args[1]).toBe(false);expect(args[1][2]).toBe('tail')
  expect(args[2].cause.message).toBe('inner');expect(args[2].cause.back).toBe(args[2]);expect(args[2].name).toBe('TypeError');expect(args[2].stack).toBe(error.stack);expect(args[2].cause.name).toBe('RangeError');expect(args[2].cause.stack).toBe(error.cause.stack)
  expect(Object.getOwnPropertyDescriptor(args[2],'cause').enumerable).toBe(false)
  host.calls.length=0
  for(const malformed of [{...packet,root:{_tag:'Reference',index:999}}, {...packet,nodes:[{_tag:'Array',length:0,fields:[['length',true,{_tag:'Value',value:1}]]}]}])expect(()=>receiveDesktopLog(malformed)).not.toThrow()
  expect(host.calls).toEqual([])
})

function graphArray(length,key) {
 return {format:'vidbee-log-graph/1',root:{_tag:'Reference',index:0},nodes:[
  {_tag:'Record',fields:[['level',true,{_tag:'Value',value:'info'}],['scope',true,{_tag:'Value',value:''}],['args',true,{_tag:'Reference',index:1}]]},
  {_tag:'Array',length,fields:key===undefined?[]:[[key,true,{_tag:'Value',value:'oversized'}]]}
 ]}
}
for(const [label,create] of [
 ['reviewer sparse 288-byte shape',()=>graphArray(200000)],
 ['indexed-key growth',()=>graphArray(0,'200000')],
 ['per-node array cap',()=>({...graphArray(0),nodes:[...graphArray(0).nodes,{_tag:'Array',length:1025,fields:[]}]})],
 ['too many arguments',()=>graphArray(DesktopLogBudgets.maxArguments+1)],
 ['huge string',()=>({level:'info',scope:'',args:['x'.repeat(DesktopLogBudgets.maxStringLength+1)]})],
 ['deep nesting',()=>{let value='end';for(let i=0;i<DesktopLogBudgets.maxDepth+5;i++)value={child:value};return {level:'info',scope:'',args:[value]}}],
 ['many small raw nodes',()=>({level:'info',scope:'',args:[Array.from({length:257},()=>({x:1}))]})],
 ['many small wire nodes',()=>({...graphArray(0),nodes:[...graphArray(0).nodes,...Array.from({length:256},()=>({_tag:'Record',fields:[]}))]})],
 ['aggregate fields',()=>({level:'info',scope:'',args:[Array.from({length:10},()=>Object.fromEntries(Array.from({length:220},(_,i)=>['k'+i,1])))]})],
 ['aggregate payload',()=>({level:'info',scope:'',args:Array.from({length:8},()=> 'x'.repeat(DesktopLogBudgets.maxStringLength))})],
 ['raw argument limit',()=>({level:'info',scope:'',args:Array(DesktopLogBudgets.maxArguments+1).fill(1)})],
 ['raw array length',()=>({level:'info',scope:'',args:[Array(200000)]})],
 ['throwing accessor',()=>Object.defineProperty({},'args',{enumerable:true,get(){throw Error('must never execute')}})],
 ['wrong wire root',()=>({...graphArray(0),root:{_tag:'Value',value:{level:'info',scope:'',args:[]}}})],
 ['wire chain depth',()=>{const packet=graphArray(1,'0');packet.nodes[1].fields=[['0',true,{_tag:'Reference',index:2}]];for(let i=0;i<40;i++)packet.nodes.push({_tag:'Record',fields:[['next',true,i===39?{_tag:'Value',value:'end'}:{_tag:'Reference',index:i+3}]]});return packet}],
])it(`rejects ${label} before reconstruction with bounded work and no recursive diagnostic`,()=>{
 host.native=undefined;host.calls.length=0
 const input=create(),result=inspectDesktopLog(input)
 if(label==='reviewer sparse 288-byte shape')expect(JSON.stringify(input)).toHaveLength(288)
 expect(O.isNone(result.entry)).toBe(true)
 expect(result.work.allocatedNodes).toBe(0);expect(result.work.allocatedSlots).toBe(0)
 expect(result.work.inspected).toBeLessThanOrEqual(DesktopLogBudgets.maxInspectedValues+1)
 expect(()=>receiveDesktopLog(input)).not.toThrow();expect(host.calls).toEqual([])
})
it('bounds aggregate array slots before allocation, even when each declared length fits',()=>{
 const packet=graphArray(0)
 for(let i=0;i<5;i++)packet.nodes.push({_tag:'Array',length:1024,fields:[]})
 const result=inspectDesktopLog(packet)
 expect(O.isNone(result.entry)).toBe(true);expect(result.work.allocatedNodes).toBe(0);expect(result.work.allocatedSlots).toBe(0)
})
it('sender visibly replaces every over-budget entry with a small admissible marker',()=>{
 for(const args of [Array(65).fill(1),[Array(200000)],['x'.repeat(16385)],[Array.from({length:257},()=>({x:1}))],Array(8).fill('x'.repeat(16384))]){
  const packet=encodeDesktopLog(DesktopLogEntry.make({level:'info',scope:'canary',args}))
  const result=inspectDesktopLog(packet)
  expect(O.isSome(result.entry)).toBe(true)
  expect(result.entry.value.args).toEqual([DesktopLogTruncation])
  expect(result.work.allocatedSlots).toBeLessThan(10)
 }
})
it('does not invoke a sender accessor and still delivers one visible marker',async()=>{
 let getterCalls=0,attempts=0
 const value=Object.defineProperty({},'secret',{enumerable:true,get(){getterCalls++;throw Error('secret-canary')}})
 host.native=undefined;host.calls.length=0
 const runtime=createRendererLogger(packet=>{attempts++;receiveDesktopLog(packet)})
 try {await runtime.runPromise(desktopLog(DesktopLogEntry.make({level:'info',scope:'',args:[value]})));expect(getterCalls).toBe(0);expect(attempts).toBe(1);expect(host.calls[0].args).toEqual([DesktopLogTruncation])}finally{await runtime.dispose()}
})
it('keeps trusted local native logging unbudgeted',async()=>{
 host.native=undefined;host.calls.length=0
 const runtime=createDesktopLogging(OtlpConfiguration.make({enabled:false,endpoint:'',version:''}))
 const large='x'.repeat(DesktopLogBudgets.maxStringLength+1),args=Array(65).fill(large)
 try{await runtime.runPromise(desktopLog(DesktopLogEntry.make({level:'info',scope:'local',args})));expect(host.calls).toHaveLength(1);expect(host.calls[0].args).toEqual(args)}finally{await runtime.dispose()}
})

it('rejects duplicate keys and nonenumerable schema fields cannot bypass preflight',()=>{
 host.native=undefined;host.calls.length=0
 const duplicate=graphArray(0)
 duplicate.nodes.push({_tag:'Array',length:1024,fields:[]})
 duplicate.nodes[0].fields.push(['args',true,{_tag:'Reference',index:2}])
 const hiddenArgs=Object.defineProperty({level:'info',scope:''},'args',{value:['x'.repeat(16385)]})
 const hiddenNodes=Object.defineProperty({format:'vidbee-log-graph/1',root:{_tag:'Reference',index:0}},'nodes',{value:Array(200000)})
 const date=new Date(0);date.details='x'.repeat(16385)
 for(const input of [duplicate,hiddenArgs,hiddenNodes,{level:'info',scope:'',args:[date]}]){
  const result=inspectDesktopLog(input);expect(O.isNone(result.entry)).toBe(true);expect(result.work.allocatedNodes).toBe(0);expect(result.work.allocatedSlots).toBe(0);expect(()=>receiveDesktopLog(input)).not.toThrow()
 }
 expect(host.calls).toEqual([])
})

it('rejects an application Error.stack accessor without calling it',()=>{
 host.native=undefined;host.calls.length=0;let calls=0
 const error=Object.defineProperty(new Error('custom'),'stack',{get(){calls++;throw Error('GETTER_CANARY')}})
 const packet=encodeDesktopLog(DesktopLogEntry.make({level:'info',scope:'',args:[error]}))
 receiveDesktopLog(packet)
 expect(calls).toBe(0);expect(host.calls).toHaveLength(1);expect(host.calls[0].args).toEqual([DesktopLogTruncation])
})
