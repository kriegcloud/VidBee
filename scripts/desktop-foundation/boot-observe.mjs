import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { sourceLoader, root } from './source-harness.mjs'
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
const turns=async()=>{for(let i=0;i<40;i++)await Promise.resolve()}
export async function bootObservations() {
  const out=[]
  for(const mode of ['normal','background','from-cli','windows-login','nonfatal','queue-failure','ffmpeg-failure','renderer-failure']) {
    const trace=[],windows=[],app=new EventEmitter(),ipcMain=new EventEmitter(),readiness=deferred(),ffmpeg=deferred(),kernel=deferred()
    let quitting=false,prepared=false,confirm=false,closeToTray=true
    const record=name=>(...args)=>trace.push([name,...args])
    Object.assign(app,{isPackaged:true,getPath:()=>'/synthetic/profile',setPath:record('setPath'),setName:record('name'),
      commandLine:{appendSwitch:record('switch')},requestSingleInstanceLock:()=>{trace.push(['lock']);return true},
      whenReady:()=>{trace.push(['whenReady']);return readiness.promise},getLoginItemSettings:()=>({wasOpenedAtLogin:mode==='windows-login'}),
      setAsDefaultProtocolClient:()=>false,quit:record('quit'),getAppPath:()=>'/synthetic/app'})
    class Window extends EventEmitter {
      visible=false;destroyed=false
      webContents=Object.assign(new EventEmitter(),{isDestroyed:()=>false,isCrashed:()=>false,
        setWindowOpenHandler:record('openHandler'),send:record('send'),getURL:()=> 'vidbee://renderer/index.html'})
      constructor(options){super();windows.push(this);trace.push(['window',options])}
      loadURL=async url=>trace.push(['loadURL',url])
      isDestroyed=()=>this.destroyed;isVisible=()=>this.visible;isMinimized=()=>false
      show=()=>{this.visible=true;trace.push(['show']);this.emit('show')};hide=()=>{this.visible=false;trace.push(['hide']);this.emit('hide')}
      focus=record('focus');moveTop=record('moveTop')
    }
    Window.getAllWindows=()=>windows
    const log=Object.fromEntries(['info','warn','error','initialize'].map(k=>[k,record(`log:${k}`)]));log.scope=()=>log
    const noop=()=>{}
    const overrides={
      $process:{argv:['fixture',...(mode==='background'?['--background']:mode==='from-cli'?['--from-cli']:[])],env:{},platform:mode==='windows-login'?'win32':'linux',on:record('process:on')},
      $setTimeout:()=>({unref(){}}),
      electron:{app,BrowserWindow:Window,ipcMain,protocol:{registerSchemesAsPrivileged:record('schemes'),registerFileProtocol:record('fileProtocol')}},
      'electron-log/main':log,'@electron-toolkit/utils':{electronApp:{setAppUserModelId:record('modelId')},optimizer:{}},
      '../../build/icon.png?asset':'fixture-icon','./config/logger-config':{configureLogger:record('configure')},
      './settings':{settingsManager:{applyFreshInstallLocale:record('freshLocale'),get:k=>k==='closeToTray'?closeToTray:false}},
      './ipc':{services:{app:{},settings:{},window:{}}},
      './lib/import-local-media':{localMediaKind:()=>null},
      './lib/agent-artifacts':{registerAgentArtifactProtocol:record('artifactProtocol')},
      './lib/privileged-schemes':{installPrivilegedSchemeCollector:()=>record('flushSchemes')},
      './lib/auth-client':{setupDesktopAuth:record('auth'),registerDesktopAuthProtocol:()=>false,isDesktopAuthCallback:()=>false,AUTH_PROTOCOL:'fixture-auth'},
      './lib/ipc-coalescer':{createKeyedCoalescer:()=>({flush:noop,enqueue:noop})},
      './lib/subscriptions-host':{getDesktopSubscriptions:()=>({on:record('subscriptions:on')}),listDesktopSubscriptionsSnapshot:async()=>[],
        startDesktopSubscriptions:async()=>{trace.push(['subscriptions:start']);if(mode==='nonfatal')throw Error('subscriptions')},stopDesktopSubscriptions:async()=>record('subscriptions:stop')()},
      './lib/ffmpeg-manager':{ffmpegManager:{initialize:()=>{trace.push(['ffmpeg:start']);return ffmpeg.promise}}},
      './lib/ytdlp-kernel-host':{initializeYtDlpKernelService:()=>({on:record('kernel:on'),prepare:()=>{trace.push(['kernel:prepare']);return kernel.promise}}),stopYtDlpKernelService:record('kernel:stop')},
      './lib/window-state':{getMainWindowState:()=>({width:901,height:702,maximized:true}),rememberMainWindowState:record('rememberWindow')},
      './lib/renderer-console-log':{createRendererConsoleLogGate:()=>({flush:record('console:flush')})},
      './lib/download-facade':{downloadEngine:{on:record('download:on'),flushDownloadSession:record('download:flush')}},
      './lib/task-queue-migrate':{runDesktopTaskQueueMigration:()=>{trace.push(['migration']);if(mode==='nonfatal')throw Error('migration')}},
      './lib/task-queue-host':{startDesktopTaskQueue:async()=>{trace.push(['queue:start']);if(mode==='queue-failure')throw Error('queue')}},
      './lib/video-library-host':{startVideoLibraryFiles:async()=>{trace.push(['library:start']);if(mode==='nonfatal')throw Error('library')}},
      './lib/transcript-host':{startIdleMinimalModelFill:record('idle'),startAutoTranscription:record('transcription'),subscribeTranscriptBroadcasts:record('transcript:broadcast')},
      './local-api':{startExtensionApiServer:async()=>record('api:start')(),stopExtensionApiServer:async()=>record('api:stop')()},
      './tray':{createTray:record('tray'),destroyTray:record('tray:destroy')},
      './utils/auto-launch':{applyAutoLaunchSetting:record('login')},'./utils/dock':{applyDockVisibility:record('dock')},
      './lib/share-capture-window':{destroyShareCaptureWindow:record('capture:destroy'),isAppWindow:()=>true},
      './lib/quit-confirmation-host':{deferAppQuitIfNeeded:()=>{trace.push(['confirm',confirm]);return confirm}},
      './lib/app-quit':{isAppQuitting:()=>quitting,isAppQuitPrepared:()=>prepared,prepareAppQuit:async()=>{trace.push(['prepareQuit']);quitting=true}},
      './lib/player-host':{stopPlayerHost:record('player:stop')},
      $require:id=>{if(id.startsWith('node:')||id.startsWith('@shared/')||id==='./lib/startup-dependencies')return undefined;return{} }
    }
    sourceLoader(overrides)('apps/desktop/src/main/index.ts')
    readiness.resolve();await turns()
    assert.equal(windows.length,1, JSON.stringify(trace))
    const beforeTools=trace.map(x=>x[0]);assert(!beforeTools.includes('migration'));assert(beforeTools.includes('idle'))
    if(mode==='ffmpeg-failure')ffmpeg.reject(Error('ffmpeg'));else ffmpeg.resolve();await turns();assert(!trace.some(x=>x[0]==='migration'))
    kernel.resolve();await turns()
    const window=windows[0],visibility=[]
    visibility.push(window.visible);window.emit('ready-to-show');visibility.push(window.visible)
    ipcMain.emit('app:renderer-ready',{sender:window.webContents});visibility.push(window.visible)
    const event=()=>({preventDefault:record('preventDefault')})
    if(mode==='renderer-failure')window.webContents.emit('unresponsive')
    window.emit('close',event());visibility.push(window.visible)
    closeToTray=false;confirm=true;window.emit('close',event())
    app.emit('before-quit',event());confirm=false;app.emit('before-quit',event());await turns()
    window.emit('close',event());prepared=true;app.emit('before-quit',event());window.emit('closed');app.emit('will-quit');await turns()
    // Preserve full vectors, replacing only host objects/functions that are not wire values.
    const safe=(value,seen=[])=>{if(typeof value==='function')return '<function>';if(value instanceof Error)return{name:value.name,message:value.message};if(seen.includes(value))return'<reference>';if(Array.isArray(value))return value.map(v=>safe(v,[...seen,value]));if(value&&typeof value==='object'){if(value===window)return'<window>';return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,safe(v,[...seen,value])]))}return value}
    out.push({mode,beforeTools,visibility,trace:safe(trace)})
  }
  return JSON.parse(JSON.stringify(out).split(root.slice(0,-1)).join('<checkout>'))
}
