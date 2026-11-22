import { scratchRoot } from './scratch.mjs'
import { screenControlObservations } from './screen-controls.mjs'
import { channelTimingObservations } from './channel-timing.mjs'
import { importGraphObservations } from './import-graph.mjs'
import { bootObservations } from './boot-observe.mjs'
import { lifecycleObservations } from './renderer-lifecycle.mjs'
import { loggingObservations } from './log-observe.mjs'
import { remainingObservations } from './remaining-observe.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { createStore } from 'jotai'
import os from 'node:os'
import path from 'node:path'
import { settingsHarness, sourceLoader } from './source-harness.mjs'

const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no }); return { promise,resolve,reject } }
const turns = async () => { for (let i=0;i<30;i++) await Promise.resolve() }
const plain = value => JSON.parse(JSON.stringify(value, (_key,v) => v instanceof Error ? { name:v.name,message:v.message } : v))
const decorators = { IpcService: class {}, IpcMethod: () => () => {} }

export function portableObservations() {
  const out = []
  for (const marker of ['success','read-failure','write-failure','path-failure']) {
    const trace=[], env={ VIDBEE_PORTABLE_DIR:'/portable/new' }
    const module=sourceLoader({ $process:{env}, 'node:fs': {
      readFileSync:(...args) => { trace.push(['read',...args]); if(marker==='read-failure') throw Error('read'); return ' /portable/old\n' },
      mkdirSync:(...args)=>trace.push(['mkdir',...args]),
      writeFileSync:(...args)=> { trace.push(['write',...args]); if(marker==='write-failure') throw Error('write') }
    }, electron:{app:{isPackaged:true,setPath:(...args)=>{trace.push(['setPath',...args]);if(marker==='path-failure')throw Error('path')}}}
    })('apps/desktop/src/main/portable.ts')
    module.rememberPortableRoot()
    out.push({marker,previous:module.previousPortableRoot,env,trace})
  }
  for(const packaged of [false,true])for(const variables of [{},{VIDBEE_PORTABLE_DIR:'/portable/one'},{PORTABLE_EXECUTABLE_DIR:'/portable/two'},{VIDBEE_PORTABLE_DIR:'/portable/one',PORTABLE_EXECUTABLE_DIR:'/portable/two'},{VIDBEE_PORTABLE_DIR:'',PORTABLE_EXECUTABLE_DIR:''},{VIDBEE_PORTABLE_DIR:'/portable/one',PORTABLE_EXECUTABLE_DIR:''}]) {
    const trace=[],env={...variables};const module=sourceLoader({$process:{env},'node:fs':{readFileSync:(...args)=>{trace.push(['read',...args]);return '/portable/old'},mkdirSync:(...args)=>trace.push(['mkdir',...args]),writeFileSync:(...args)=>trace.push(['write',...args])},electron:{app:{isPackaged:packaged,getPath:key=>{trace.push(['getPath',key]);return '/synthetic/appData'},setPath:(...args)=>trace.push(['setPath',...args])}}})('apps/desktop/src/main/portable.ts');module.rememberPortableRoot();out.push({packaged,variables,root:module.portableRoot,portable:module.isPortableMode,env,trace})
  }
  // Path lookup failure is observed at the real manager boundary without letting Conf choose a host profile.
  const trace=[]
  class Store { constructor(options) { trace.push(['construct',options]); throw Error('controlled store stop') } }
  try { sourceLoader({electron:{app:{getPath:()=>{throw Error('getPath')}}},'electron-store':Store,
    './portable':{isPortableMode:false},'node:os':{homedir:()=>'/synthetic/home'},'./utils/logger':{}})('apps/desktop/src/main/settings.ts') }
  catch(error){trace.push(['thrown',error.message])}
  out.push({pathLookupFailure:trace})
  const directory=fs.mkdtempSync(path.join(scratchRoot(),'foundation-path-fallback-'))
  try {
    const once=path.join(directory,'once'),always=path.join(directory,'always');fs.mkdirSync(once);fs.mkdirSync(always)
    fs.writeFileSync(path.join(once,'config.json'),JSON.stringify({language:'fr',lastSeenWhatsNew:'old'}))
    const h=settingsHarness(once,{pathFailures:1}),constructor=h.raw()
    h.manager.applyFreshInstallLocale()
    out.push({installedPathFallback:{constructor,afterLocale:h.raw(),trace:h.trace}})
    try {settingsHarness(always,{failPath:true});assert.fail('Expected the installed store path lookup to fail')}
    catch(error){out.push({installedPathFailure:{name:error.name,message:error.message,fileExists:fs.existsSync(path.join(always,'config.json'))}})}
  } finally {fs.rmSync(directory,{recursive:true,force:true})}
  return out
}

export async function rendererObservations() {
  const out=[]
  for (const scenario of ['language-success','language-failure','same-language','load-failure','save-success','save-failure','overlap-first-fails','overlap-second-fails','batch-failure']) {
    const calls=[], errors=[], language=deferred(), read=deferred(), requests=[]
    const module=sourceLoader({ '../lib/ipc':{ipcServices:{settings:{getAll:()=>{calls.push(['getAll']);return read.promise},
      set:(...args)=>{calls.push(['set',...args]);const d=deferred();requests.push(d);return d.promise},
      setAll:(...args)=>{calls.push(['setAll',...args]);const d=deferred();requests.push(d);return d.promise}}}},
      '../i18n':{__esModule:true,default:{language:'en',changeLanguage:value=>{calls.push(['changeLanguage',value]);return language.promise}}},
      '../lib/logger':{logger:{error:(...args)=>errors.push(args)}}
    })('apps/desktop/src/renderer/src/store/settings.ts')
    const store=createStore(), states=[]
    const snapshot=label=>states.push({label,settings:store.get(module.settingsAtom),loaded:store.get(module.settingsLoadedAtom),notifications:store.get(module.enableDownloadNotificationsAtom)})
    snapshot('provisional')
    const loading=store.set(module.loadSettingsAtom)
    if(scenario==='load-failure') read.reject(Error('load failed'))
    else read.resolve({...store.get(module.settingsAtom),language:scenario==='same-language'?'en':'ja-JP',theme:'dark',enableDownloadNotifications:false})
    await turns(); snapshot('language-pending')
    if(scenario==='language-failure')language.reject(Error('language failed'));else language.resolve()
    await loading;snapshot('loaded')
    if(scenario.startsWith('save-')) {
      const saving=store.set(module.saveSettingAtom,{key:'theme',value:'light'});snapshot('optimistic')
      if(scenario==='save-failure')requests[0].reject(Error('save failed'));else requests[0].resolve()
      await saving;snapshot('saved')
    }
    if(scenario.startsWith('overlap-')) {
      const a=store.set(module.saveSettingAtom,{key:'theme',value:'light'}), b=store.set(module.saveSettingAtom,{key:'language',value:'fr'})
      snapshot('both-pending')
      if(scenario==='overlap-first-fails'){requests[0].reject(Error('first'));await a;snapshot('first-failed');requests[1].resolve();await b}
      else {requests[0].resolve();await a;snapshot('first-succeeded');requests[1].reject(Error('second'));await b}
      snapshot('settled')
    }
    if(scenario==='batch-failure') {const p=store.set(module.saveAllSettingsAtom,{theme:'light'});snapshot('batch-pending');requests[0].reject(Error('batch'));await p;snapshot('batch-failed')}
    out.push({scenario,states,calls,errors})
  }
  return plain(out)
}

const appFixture = (options={}) => sourceLoader({
  electron:{app:options.app??{},BrowserWindow:{getFocusedWindow:()=>options.focused},dialog:{showMessageBox:options.dialog}},
  'electron-ipc-decorator':decorators,'node:os':options.os??{},$process:options.process??{},$fetch:options.fetch,
  '../../lib/ffmpeg-manager':{},'../../lib/ytdlp-manager':{},'../../lib/ytdlp-kernel-host':{getYtDlpKernelService:()=>options.kernel},
  '../../utils/logger':{scopedLoggers:{system:{error:(...args)=>options.logs?.push(args)}}}
})('apps/desktop/src/main/ipc/services/app-service.ts').AppService

export async function appObservations() {
  const out={os:[],icons:[],dialogs:[]}
  for(const platform of ['win32','darwin','linux','other']) for(const version of ['10.0.21999','10.0.22000','10.0.22001','bad','']) for(const from of ['electron','version','release']) {
    const Service=appFixture({os:{platform:()=>platform,version:from==='release'?undefined:()=>version,release:()=>version},process:from==='electron'?{getSystemVersion:()=>version}:{}})
    out.os.push({platform,version,from,result:new Service().getOsVersion({})})
  }
  for(const scenario of ['success','rejection','synchronous-failure']) for(const focused of [undefined,{id:'focused'}]) {
    const d=deferred(),sender=new EventEmitter(),calls=[],error=Error('native failure'), options={message:'fixture',buttons:['Yes','No'],checkboxLabel:'Fixture',checkboxChecked:true,cancelId:1,defaultId:0,detail:'details',noLink:true}
    let cancelled=0,settled=false
    const signal=new AbortController();signal.signal.addEventListener('abort',()=>cancelled++)
    const Service=appFixture({focused,dialog:(...args)=>{calls.push(args);if(scenario==='synchronous-failure')throw error;return d.promise}})
    const outcome=new Service().showMessageBox({sender},options).then(value=>{settled=true;return{value}},e=>{settled=true;assert.equal(e,error);return{error:e}})
    sender.emit('did-start-navigation');sender.emit('destroyed');await turns()
    const pendingAfterDeparture=!settled
    if(scenario==='success')d.resolve({response:1,checkboxChecked:true});else d.reject(error)
    // The unused promise in synchronous-failure is not part of native work.
    if(scenario==='synchronous-failure')d.promise.catch(()=>{})
    out.dialogs.push({scenario,focused:focused??null,calls,pendingAfterDeparture,cancelled,outcome:await outcome,listeners:sender.eventNames()})
  }
  const trace=[],preparation=deferred(),status={ready:true,state:'up-to-date',source:'bundled',ytDlpVersion:'fixture',nodeVersion:'fixture',progress:100}
  const Service=appFixture({kernel:{prepare:()=>{trace.push('prepare');return preparation.promise},getStatus:()=>{trace.push('status');return status}},app:{quit:()=>trace.push('quit')}})
  const service=new Service(),p=service.retryYtDlpKernelPreparation({});await turns();out.retryPending=trace.slice();preparation.resolve();out.retryResult=await p
  service.quit({});out.retryTrace=trace
  {const trace=[],failure=Error('preparation failed'),pending=deferred();const Retry=appFixture({kernel:{prepare:()=>{trace.push('prepare');return pending.promise},getStatus:()=>{trace.push('status');return status}}});const p=new Retry().retryYtDlpKernelPreparation({}).catch(error=>{assert.equal(error,failure);return error.message});pending.reject(failure);out.retryFailure={result:await p,trace}}
  for(const responses of [[{ok:false},{ok:false}],[{ok:true,type:'text/plain'},{ok:true,type:'image/x-icon'}],['throw','throw'],[{ok:true,type:null}]]) {
    const calls=[],logs=[]
    const Icon=appFixture({logs,fetch:async url=>{calls.push(url);const next=responses[calls.length-1];if(next==='throw')throw Error('offline');return {ok:next.ok,headers:{get:()=>next.type},arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer}}})
    out.icons.push({responses,result:await new Icon().getSiteIcon({},'fixture.invalid'),calls,logs})
  }
  return plain(out)
}

export async function registrarObservations() {
  const trace=[],handlers={},logs=[]
  const ipcMain={handle:(channel,fn)=>{trace.push(['handle',channel]);handlers[channel]=fn},removeHandler:channel=>{trace.push(['remove',channel]);delete handlers[channel]}}
  const installed=sourceLoader({electron:{ipcMain},$console:{error:(...args)=>logs.push(args)}})('node_modules/electron-ipc-decorator/dist/index.js')
  const out=[]
  for(const mode of ['success','throw','reject']) {
    const error=Error('original'),local=[]
    class Service extends installed.IpcService { static groupName=mode; method(context,...args){local.push(['prefix',args,context.sender]);if(mode==='throw')throw error;if(mode==='reject')return Promise.reject(error);return 'value'} }
    installed.IpcMethod()(Service.prototype,'method',Object.getOwnPropertyDescriptor(Service.prototype,'method'))
    new Service();new Service()
    const p=handlers[`${mode}.method`]({sender:'owned'},1,'two').then(value=>local.push(['settled',value]),e=>{assert.equal(e,error);local.push(['rejected',e.message])})
    local.push(['returned']);await Promise.resolve();local.push(['microtask']);await p
    out.push({mode,local})
  }
  const serviceStub={}
  const stub=new Proxy(class {},{get:()=>undefined})
  sourceLoader({electron:{ipcMain},'electron-ipc-decorator':{createServices:()=>({fs:{saveMarkdownPdf(){}}})},$require:id=>id.startsWith('./services/')?new Proxy(serviceStub,{get:()=>stub}):undefined})('apps/desktop/src/main/ipc/index.ts')
  ipcMain.handle('replacement',()=>{});ipcMain.handle('replacement',()=>{})
  return plain({out,trace,logs})
}

export async function captureObservations() {
  const trace=[],windows=[];let receive
  class Window extends EventEmitter {
    destroyed=false; color=0; width=0;height=0; paint
    webContents={isDestroyed:()=>false,setBackgroundThrottling:()=>{},
      send:(channel,message)=>{this.message=message;trace.push(['start',channel,message])},
      executeJavaScript:async script=>{if(script==='window.devicePixelRatio')return 1;const m=script.match(/background:#([a-f0-9]{6})/);if(m)this.color=Number.parseInt(m[1],16)},
      on:(_event,fn)=>{this.paint=fn},removeListener:()=>{this.paint=undefined},invalidate:()=>{
        if(!this.paint)return;const buffer=Buffer.alloc(this.width*this.height*4);buffer.writeUIntLE(this.color,(this.width-1)*4,3)
        this.paint({}, {}, {getSize:()=>({width:this.width,height:this.height}),toBitmap:()=>buffer,isEmpty:()=>false,
          crop:()=>({isEmpty:()=>false,toPNG:()=>Buffer.from([137,80,78,71,this.message.payload.sequence])})})}}
    constructor(){super();windows.push(this)}
    loadURL=async()=>{receive({sender:this.webContents},{requestId:0})}
    setContentSize=(width,height)=>{this.width=width;this.height=height}
    isDestroyed=()=>this.destroyed
    destroy=()=>{trace.push(['destroy',windows.indexOf(this)]);this.destroyed=true;this.emit('closed')}
  }
  let empty=false
  const deps={BrowserWindow:Window,ipcMain:{on:(_channel,fn)=>{receive=fn}},nativeImage:{createFromBuffer:buffer=>{trace.push(['image',Array.from(buffer)]);return {isEmpty:()=>empty,toPNG:()=>buffer}}},clipboard:{writeImage:image=>trace.push(['clipboard',Array.from(image.toPNG())])}}
  const module=sourceLoader({electron:deps,'../utils/logger':{scopedLoggers:{window:{warn:(...args)=>trace.push(['warn',...args])}}},'./share-image-split':{}})('apps/desktop/src/main/lib/share-capture-window.ts')
  const host=module.createShareCaptureHost(deps),callers=[new EventEmitter(),new EventEmitter(),new EventEmitter()]
  const payloads=[1,2,3].map(sequence=>({kind:'caption',sequence,quote:{quote:`card ${sequence}`,before:'',after:'',startMs:0,endMs:1000},sourceTitle:'Fixture'}))
  const Service=sourceLoader({electron:{BrowserWindow:{}},'electron-ipc-decorator':decorators,'../../lib/share-capture-window':host})('apps/desktop/src/main/ipc/services/window-service.ts').WindowService
  const service=new Service()
  const promises=payloads.map((payload,index)=>service.captureShareCard({sender:callers[index]},payload).then(v=>{assert.equal(Object.prototype.toString.call(v),'[object ArrayBuffer]');return {bytes:Array.from(new Uint8Array(v))}},e=>({error:e.message})))
  await turns();const firstOnly=trace.slice();callers[1].emit('destroyed');callers[2].emit('did-start-navigation')
  const outcomes=[]
  for(let i=0;i<3;i++) {await turns();const window=windows[i];assert(window);receive({sender:window.webContents},{requestId:window.message.requestId,...(i===1?{error:'capture failed'}:{width:2,height:1})});outcomes.push(await promises[i])}
  module.writeShareImagePng(new Uint8Array([1,2]).buffer);empty=true
  let emptyError;try{module.writeShareImagePng(new Uint8Array([3]).buffer)}catch(e){emptyError=e.message}
  return plain({payloads,firstOnly,outcomes,trace,emptyError,destroyed:windows.map(w=>w.destroyed)})
}


export function settingsEventObservations() {
  const directory=fs.mkdtempSync(path.join(scratchRoot(),'foundation-events-'))
  try {
    const h=settingsHarness(directory),trace=[]
    const windows=[1,2].map(id=>({webContents:{send:(...args)=>trace.push(['broadcast',id,args,h.raw()])}}))
    const settingsManager={setAll:updates=>{trace.push(['write',updates]);h.manager.setAll(updates)},getAll:()=>{trace.push(['reread']);return h.manager.getAll()}}
    const source=sourceLoader({electron:{BrowserWindow:{getAllWindows:()=>windows}},'../settings':{settingsManager},
      '../utils/auto-launch':{applyAutoLaunchSetting:value=>trace.push(['login',value])},'../utils/dock':{applyDockVisibility:value=>trace.push(['dock',value])},
      './app-icon-menu':{refreshAppIconMenus:()=>trace.push(['language'])},'./task-queue-host':{applyDesktopQueueConcurrency:()=>trace.push(['queue'])}})
    const host=source('apps/desktop/src/main/lib/settings-host.ts')
    host.updateDesktopSettings({launchAtLogin:false,hideDockIcon:false,language:'fr'})
    trace.push(['returned']);host.updateDesktopSettings({});trace.push(['empty-returned'])
    return plain(trace)
  } finally {fs.rmSync(directory,{recursive:true,force:true})}
}


export const importEffectsObservations = importGraphObservations

export async function auditObservations() {
  return plain({screenControls:await screenControlObservations(),channelTiming:await channelTimingObservations(),importEffects:importEffectsObservations(),settingsEvents:settingsEventObservations(),remaining:await remainingObservations(),boot:await bootObservations(),lifecycle:await lifecycleObservations(),logging:loggingObservations(),portable:portableObservations(),renderer:await rendererObservations(),app:await appObservations(),registrar:await registrarObservations(),capture:await captureObservations()})
}
if(process.argv.includes('--record')) auditObservations().then(value => process.stdout.write(JSON.stringify(value,null,2)+'\n'))
