import { scratchRoot } from './scratch.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sourceLoader, root } from './source-harness.mjs'

export function importGraphObservations() {
  const directory=fs.mkdtempSync(path.join(scratchRoot(),'foundation-graph-')),trace=[]
  const stop=Error('owned exit'),noop=()=>{}
  const app={isPackaged:true,isReady:()=>false,whenReady:()=>{trace.push(['csp:whenReady']);return new Promise(()=>{})},getAppPath:()=>path.join(root,'apps/desktop'),getPath:()=>directory,once:(event)=>trace.push(['app:once',event]),getVersion:()=> '2.4.0',setPath:noop,setName:noop,commandLine:{appendSwitch:noop},on:noop,
    requestSingleInstanceLock:()=>{trace.push(['lock']);return false},exit:code=>{trace.push(['exit',code]);throw stop}}
  const ipcMain={on:noop,removeHandler:channel=>trace.push(['remove',channel]),handle:channel=>trace.push(['handle',channel])}
  const electron={app,ipcMain,BrowserWindow:{},protocol:{registerSchemesAsPrivileged:noop}}
  const Store=sourceLoader({electron})('node_modules/electron-store/index.js').default
  class ObservedStore extends Store {
    constructor(options){trace.push([options?.name==='ai'?'ai:construct':'settings:construct']);super(options)}
    onDidAnyChange(callback){trace.push(['ai:listen']);return ()=>{}}
    set(...args){trace.push(['settings:write',...args]);return super.set(...args)}
  }
  const host=new Proxy({}, {get:(_target,key)=>key==='__esModule'?false:noop})
  const log={info:(...args)=>trace.push(['log:info',...args]),error:noop,warn:noop,initialize:()=>trace.push(['logger']),scope:name=>{trace.push(['log:scope',name]);return log},transports:{console:{},file:{getFile:()=>({path:'/synthetic/logs/main.log'})},ipc:{}},errorHandler:{startCatching:options=>trace.push(['log:catch',{...options,onError:'<function>'}])}}
  let load
  load=sourceLoader({$onLoad:file=>trace.push(['import',file]),electron,'electron-store':ObservedStore,'node:fs':{...fs,mkdirSync:(...args)=>{trace.push(['fs:mkdir',args[0]]);return fs.mkdirSync(...args)},watch:(root,options)=>{trace.push(['ai:watch',root,options]);return {on:()=>{},close:noop}}},'node:os':{homedir:()=>directory},
    $glob:()=>Object.fromEntries(fs.readdirSync(path.join(root,'skills')).sort().filter(name=>fs.existsSync(path.join(root,'skills',name,'SKILL.md'))).map(name=>[name,fs.readFileSync(path.join(root,'skills',name,'SKILL.md'),'utf8')])),$Date:class extends Date{static now(){return 1583755200000}},$process:{cwd:()=>root,pid:2,argv:['fixture'],resourcesPath:directory,env:{},platform:'linux',on:noop},
    'electron-log/main':log,'@vidbee/logger/legacy':{initVidbeeLogger:options=>trace.push(['log:init',options])},
    '@better-auth/electron/storage':{storage:options=>{trace.push(['auth:storage',options]);return 'owned-storage'}},'@better-auth/electron/client':{electronClient:options=>{trace.push(['auth:plugin',{...options,sanitizeUser:'<function>'}]);return 'owned-plugin'}},'better-auth/client':{createAuthClient:options=>{trace.push(['auth:client',options]);return{setupMain:options=>trace.push(['auth:setupMain',{...options,getWindow:'<function>'}])}}},
    $require:(id,filename)=>{
      if(id==='@electron-toolkit/utils')return load('node_modules/@electron-toolkit/utils/dist/index.cjs')
      if(id.endsWith('?asset'))return '<asset>'
      if(id==='@earendil-works/pi-durable/env/node'){trace.push(['sdk:import',id]);return undefined}
      const sdkFailures={
        '@earendil-works/pi-ai':'self',
        '@earendil-works/pi-agent-core':'self',
        '@earendil-works/pi-ai/compat':'self',
        '@earendil-works/pi-ai/models':'self',
        '@earendil-works/chord/context':'self',
        '@earendil-works/pi-durable':'@earendil-works/chord',
        '@earendil-works/pi-durable/storage/jsonl/node':'@earendil-works/chord/delta',
        '@earendil-works/pi-durable/tool-search':'@earendil-works/pi-ai',
        '@earendil-works/pi-durable/tools':'@earendil-works/chord/output'
      }
      if(Object.hasOwn(sdkFailures,id)){trace.push(['host',id,'ERR_PACKAGE_PATH_NOT_EXPORTED under pinned Node + tsx require',sdkFailures[id]]);return host}
      if(id==='electron-ipc-decorator')return load('node_modules/electron-ipc-decorator/dist/index.js')
      if(filename.endsWith('/main/index.ts')) {
        if(id==='@vidbee/ui/lib/url-kind'||id.startsWith('./')||id.startsWith('../shared/')||id==='./ipc'||id==='./settings'||id==='./lib/auth-client'||id==='./lib/privileged-schemes'||id==='./portable'||id==='./config/logger-config'||id==='./utils/logger'||id.startsWith('@shared/')||id.startsWith('node:'))return undefined
        trace.push(['host',id,'entrypoint capability outside pre-lock registration; injected host']);return host
      }
      if(filename.includes('/main/ipc/services/')&&(id.startsWith('../../lib/')||id.startsWith('../../mcp/')||id.startsWith('../../download-engine/')||id.startsWith('../../utils/')))return undefined
      return undefined
    }})
  try {
    let failure
    try {load('apps/desktop/src/main/index.ts')} catch(error) {failure=error}
    assert.equal(trace.filter(row=>row[0]==='settings:construct').length,1)
    assert.equal(trace.filter(row=>row[0]==='ai:construct').length,1)
    assert.equal(trace.filter(row=>row[0]==='ai:listen').length,1)
    assert.equal(trace.filter(row=>row[0]==='ai:watch').length,1)
    assert(trace.findIndex(row=>row[0]==='settings:construct')<trace.findIndex(row=>row[0]==='handle'))
    assert.equal(failure,stop,'Import initialization must reach rejected-lock exit')
    return JSON.parse(JSON.stringify(trace).split(directory).join('<profile>'))
  } finally {fs.rmSync(directory,{recursive:true,force:true})}
}
