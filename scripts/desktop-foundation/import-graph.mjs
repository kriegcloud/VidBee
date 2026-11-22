import { scratchRoot } from './scratch.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sourceLoader } from './source-harness.mjs'

export function importGraphObservations() {
  const directory=fs.mkdtempSync(path.join(scratchRoot(),'foundation-graph-')),trace=[]
  const stop=Error('owned exit'),noop=()=>{}
  const app={isPackaged:true,whenReady:()=>{trace.push(['csp:whenReady']);return new Promise(()=>{})},getPath:()=>directory,getVersion:()=> '2.4.0',setPath:noop,setName:noop,commandLine:{appendSwitch:noop},on:noop,
    requestSingleInstanceLock:()=>{trace.push(['lock']);return false},exit:code=>{trace.push(['exit',code]);throw stop}}
  const ipcMain={on:noop,removeHandler:channel=>trace.push(['remove',channel]),handle:channel=>trace.push(['handle',channel])}
  const electron={app,ipcMain,BrowserWindow:{},protocol:{registerSchemesAsPrivileged:noop}}
  const Store=sourceLoader({electron})('node_modules/electron-store/index.js').default
  class ObservedStore extends Store {
    constructor(options){trace.push(['settings:construct']);super(options)}
    set(...args){trace.push(['settings:write',...args]);return super.set(...args)}
  }
  const host=new Proxy({}, {get:(_target,key)=>key==='__esModule'?false:noop})
  const log={info:(...args)=>trace.push(['log:info',...args]),error:noop,warn:noop,initialize:()=>trace.push(['logger']),scope:name=>{trace.push(['log:scope',name]);return log},transports:{console:{},file:{getFile:()=>({path:'/synthetic/logs/main.log'})},ipc:{}},errorHandler:{startCatching:options=>trace.push(['log:catch',{...options,onError:'<function>'}])}}
  let load
  load=sourceLoader({electron,'electron-store':ObservedStore,'node:fs':{...fs,mkdirSync:noop},'node:os':{homedir:()=>'/synthetic/home'},
    $process:{argv:['fixture'],env:{},platform:'linux',on:noop},
    'electron-log/main':log,'@vidbee/logger/legacy':{initVidbeeLogger:options=>trace.push(['log:init',options])},
    '@better-auth/electron/storage':{storage:options=>{trace.push(['auth:storage',options]);return 'owned-storage'}},'@better-auth/electron/client':{electronClient:options=>{trace.push(['auth:plugin',{...options,sanitizeUser:'<function>'}]);return 'owned-plugin'}},'better-auth/client':{createAuthClient:options=>{trace.push(['auth:client',options]);return{setupMain:options=>trace.push(['auth:setupMain',{...options,getWindow:'<function>'}])}}},'./lib/ipc-coalescer':{createKeyedCoalescer:()=>({})},
    './lib/subscriptions-host':{getDesktopSubscriptions:()=>({on:noop})},
    $require:(id,filename)=>{
      if(id==='electron-ipc-decorator')return load('node_modules/electron-ipc-decorator/dist/index.js')
      if(filename.endsWith('/main/index.ts')) {
        if(id==='./ipc'||id==='./settings'||id==='./lib/auth-client'||id==='./lib/privileged-schemes'||id==='./portable'||id==='./config/logger-config'||id==='./utils/logger'||id.startsWith('@shared/')||id.startsWith('node:'))return undefined
        return host
      }
      if(id.startsWith('../../lib/')||id.startsWith('../../mcp/')||id.startsWith('../../download-engine/')||id.startsWith('../../utils/')) {
        if(id==='../../lib/settings-host'||id==='../../lib/auth-client'||id==='../../utils/logger')return undefined
        return host
      }
      if(filename.endsWith('/lib/settings-host.ts') && !['./settings-effects','../settings','../utils/logger'].includes(id))return host
      if(id.startsWith('@vidbee/') && filename.includes('/main/ipc/services/'))return host
      return undefined
    }})
  try {
    assert.throws(()=>load('apps/desktop/src/main/index.ts'),e=>e===stop)
    assert.equal(trace.filter(row=>row[0]==='settings:construct').length,1)
    assert(trace.findIndex(row=>row[0]==='settings:construct')<trace.findIndex(row=>row[0]==='handle'))
    return JSON.parse(JSON.stringify(trace).split(directory).join('<profile>'))
  } finally {fs.rmSync(directory,{recursive:true,force:true})}
}
