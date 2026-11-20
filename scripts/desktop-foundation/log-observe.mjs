import { EventEmitter } from 'node:events'
import { sourceLoader } from './source-harness.mjs'
export function loggingObservations() {
  const out=[]
  class FixedDate extends Date {
    constructor(...args){super(...(args.length?args:[Date.UTC(2020,0,2,3,4,5,6)]))}
    getFullYear(){return 2020} getMonth(){return 0} getDate(){return 2}
    getHours(){return 3} getMinutes(){return 4} getSeconds(){return 5} getMilliseconds(){return 6}
  }
  for(const development of [false,true])for(const portable of [false,true]) {
    const consoleOutput=[],fileOutput=[],ipcOutput=[],fsTrace=[]
    const fakeFs={mkdirSync:(...args)=>fsTrace.push(['mkdir',...args]),writeFileSync:(...args)=>fsTrace.push(['write',...args]),statSync:()=>({size:0})}
    const load=sourceLoader({$Date:FixedDate,fs:fakeFs})
    const Logger=load('node_modules/electron-log/src/core/Logger.js')
    const Registry=load('node_modules/electron-log/src/node/transports/file/FileRegistry.js')
    const registry=new Registry()
    const externalApi={isElectron:()=>true,sendIpc:(...args)=>ipcOutput.push(args),getPathVariables:()=>({libraryDefaultDir:portable?'/portable/new/Data/Logs':'/synthetic/profile/logs'})}
    const log=new Logger({logId:'audit',isDev:development,variables:{processType:'browser'},dependencies:{externalApi,registry},transportFactories:{
      console:load('node_modules/electron-log/src/node/transports/console.js'),file:load('node_modules/electron-log/src/node/transports/file/index.js'),ipc:load('node_modules/electron-log/src/node/transports/ipc.js')}})
    log.transports.console.useStyles=false
    log.transports.console.writeFn=({message})=>consoleOutput.push(message)
    log.errorHandler={startCatching(){}}
    sourceLoader({$process:{env:{NODE_ENV:development?'development':'production'}},'@vidbee/logger/legacy':{initVidbeeLogger(){}},'electron-log/main':log})('apps/desktop/src/main/config/logger-config.ts').configureLogger()
    fsTrace.length=0;consoleOutput.length=0;ipcOutput.length=0
    const error=new Error('fixture');error.stack='Error: fixture'
    for(const level of ['error','warn','info','verbose','debug','silly'])log.scope(' foundation ')[level]('message',{nested:[1,'two']},error,'tail')
    // FileRegistry and File are real; only the filesystem sink is replaced.
    fileOutput.push(...fsTrace)
    const format=sourceLoader()('apps/desktop/src/main/lib/desktop-console-format.ts').formatDesktopConsoleLog
    const edge=[[],[{fixture:true},'tail'],['first','second',{third:true}]].map(data=>format({data,message:{date:new FixedDate(),scope:' very-long-scope-name '}}))
    out.push({development,portable,consoleOutput,fileOutput,ipcOutput,edge,path:log.transports.file.getFile().path})
  }
  return JSON.parse(JSON.stringify(out))
}
