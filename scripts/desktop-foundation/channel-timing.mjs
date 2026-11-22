import assert from 'node:assert/strict'
import { sourceLoader } from './source-harness.mjs'

// The same clock is used for actual registrations and reference probes. Each
// counter tick is a Promise continuation, not a wall clock or one broad marker.
export async function settlementObservation(invoke, complete) {
  const trace=[];let settled=false,turn=0
  const error=Error('original'),logs=[]
  const p=invoke(error,logs).then(value=>{trace.push(['success',turn,value]);settled=true},e=>{assert.equal(e,error);trace.push(['failure',turn,e.message]);settled=true})
  trace.push(['returned',turn])
  for(;turn<32&&!settled;turn++) {
    if(turn===8&&complete)complete(error)
    await Promise.resolve()
    trace.push(['turn',turn])
  }
  assert(settled,'Settlement escaped observation window')
  await p
  return {trace,logs:logs.map(args=>args.map(value=>value===error?'<original-error>':value))}
}
export async function channelTimingObservations() {
  const out=[]
  for(const channel of ['settings.get','app.showMessageBox'])for(const mode of ['sync','throw','resolved','rejected','deferred-success','deferred-failure']) {
    const handlers={},logs=[];let resolve,reject,error
    const native=new Promise((a,b)=>{resolve=a;reject=b})
    const result=()=>{if(mode==='throw')throw error;if(mode==='resolved')return Promise.resolve('value');if(mode==='rejected')return Promise.reject(error);if(mode.startsWith('deferred'))return native;return 'value'}
    let load
    load=sourceLoader({electron:{ipcMain:{handle:(name,fn)=>{handlers[name]=fn}},app:{},BrowserWindow:{getFocusedWindow:()=>undefined},dialog:{showMessageBox:result}},
      $console:{error:(...args)=>logs.push(args)},
      '../../lib/ffmpeg-manager':{},'../../lib/ytdlp-manager':{},'../../lib/ytdlp-kernel-host':{},'../../utils/logger':{scopedLoggers:{system:{}}},'../../settings':{settingsManager:{get:result}},'../../lib/settings-host':{},'../../lib/task-queue-host':{},'../../utils/auto-launch':{},'../../utils/dock':{},
      $require:id=>id==='electron-ipc-decorator'?load('node_modules/electron-ipc-decorator/dist/index.js'):undefined})
    const {SettingsService}=load('apps/desktop/src/main/ipc/services/settings-service.ts');new SettingsService();const {AppService}=load('apps/desktop/src/main/ipc/services/app-service.ts');new AppService()
    const observation=await settlementObservation(e=>{error=e;return handlers[channel]({sender:'owned'},channel==='settings.get'?'theme':{message:'fixture'})},e=>mode==='deferred-failure'?reject(e):resolve('value'))
    out.push({channel,mode,...observation,console:logs.map(args=>args.map(v=>v===error?'<original-error>':v))})
  }
  return out
}
