import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { mainInspector } from './inspector.mjs'
import { setTimeout as delay } from 'node:timers/promises'
export async function packagedControls(owned,cdp) {
  const main=await mainInspector(owned),out=[]
  const labels=JSON.parse(await fs.readFile(new URL('../../packages/i18n/src/locales/en.json',import.meta.url),'utf8')).settings
  const run=async expression=>{const r=await main.evaluate(expression);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value}
  const view=async expression=>{const r=await cdp.evaluate(expression);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value}
  const row=key=>key==='language'?`document.querySelectorAll('[role="combobox"]')[1].closest('[data-slot="item"]')`:`[...document.querySelectorAll('[data-slot="item"]')].find(n=>n.querySelector('[data-slot="item-title"]')?.textContent===${JSON.stringify(labels[key])})`
  const snapshot=async()=>view(`window.electron.ipcRenderer.invoke('settings.getAll')`)
  try {
    await run(`globalThis.__foundationIpc=process.mainModule.require('electron').ipcMain;globalThis.__foundationWrites=[];globalThis.__foundationStoreModule=process.mainModule.require(process.resourcesPath+'/app.asar/node_modules/electron-store');globalThis.__foundationStore=(__foundationStoreModule.default??__foundationStoreModule).prototype;globalThis.__foundationSet=__foundationStore.set;__foundationStore.set=function(...args){__foundationWrites.push(args);return Reflect.apply(__foundationSet,this,args)};true`)
    for(const [tab,key,kind,value] of [['general','theme','select','Light'],['general','language','select','Français'],['metadata','subtitleLanguages','subtitle','Français'],['metadata','embedThumbnail','switch'],['advanced','maxConcurrentDownloads','select','3'],['advanced','proxy','input','http://fixture.invalid']]) {
      await view(`location.hash='/settings?tab=${tab}';true`);await delay(400)
      const before=await snapshot(),start=await run('__foundationWrites.length')
      if(kind==='subtitle'){await view(`${row(key)}.querySelector('[role=\"combobox\"]').click();true`);await delay(100);await view(`[...document.querySelectorAll('[role=\"option\"]')].find(n=>n.textContent.trim()===${JSON.stringify(value)}).click();true`);await view(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`)}
      else if(kind==='select') {
        await view(`(()=>{const row=${row(key)};if(!row)throw Error('Missing row ${key}');const node=row.querySelector('[role="combobox"]');node.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));return true})()`);await delay(100)
        const options=await view(`[...document.querySelectorAll('[role="option"]')].map(n=>n.textContent)`)
        const target=options.includes(value)?value:options.find(v=>v!==String(before[key]))
        assert(target,`Missing option for ${key}`)
        await view(`(()=>{const n=[...document.querySelectorAll('[role="option"]')].find(n=>n.textContent===${JSON.stringify(target)});n.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true})()`)
      } else if(kind==='switch')await view(`(()=>{const row=${row(key)};row.querySelector('[role="switch"]').click();return true})()`)
      else await view(`(()=>{const n=${row(key)}.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
      await delay(200)
      const after=await snapshot(),writes=await run(`__foundationWrites.slice(${start})`)
      const visible=await view(`${row(key)}.${kind==='input'?'querySelector("input").value':'innerText'}`)
      await view('location.reload();true');await delay(1500)
      const reloaded=await snapshot(),visibleReload=await view(`${row(key)}.${kind==='input'?'querySelector("input").value':'innerText'}`)
      assert.deepEqual(reloaded[key],after[key]);assert.equal(visibleReload,visible)
      if(kind==='input'){assert.equal(visible,value);assert.equal(visibleReload,value)}
      assert(writes.some(args=>args[0]===key),`No outbound write for ${key}`)
      out.push({tab,key,kind,before:before[key],after:after[key],writes,visible,visibleReload,reloaded:reloaded[key]})
      if(key==='language'){await view("window.electron.ipcRenderer.invoke('settings.set','language','en')");await view('location.reload();true');await delay(1500)}
    }
    // Native picker outcomes are controlled at the owned main IPC host. The real
    // packaged Settings click handler still handles selection/cancellation/error.
    for(const [key,channel,tab] of [['downloadPath','fs.selectDirectory','general'],['configPath','fs.selectFile','advanced']]) {
      await run(`globalThis.__foundationPicker=__foundationIpc._invokeHandlers.get(${JSON.stringify(channel)});true`)
      for(const mode of ['selected','cancelled','failure']) {
        const selected=key==='downloadPath'?owned.run+'/home/selected-downloads':owned.run+'/home/selected-config'
        await run(`__foundationIpc.removeHandler(${JSON.stringify(channel)});__foundationIpc.handle(${JSON.stringify(channel)},()=>{${mode==='failure'?"throw Error('controlled picker failure')":`return ${JSON.stringify(mode==='selected'?selected:null)}`}});true`)
        await view(`location.hash='/settings?tab=${tab}';true`);await delay(300)
        const before=await snapshot(),start=await run('__foundationWrites.length')
        await view(`(()=>{const row=${row(key==='configPath'?'configFile':key)};row.querySelector('button').click();return true})()`);await delay(200)
        const after=await snapshot(),writes=await run(`__foundationWrites.slice(${start})`)
        if(mode==='selected')assert.equal(after[key],selected);else assert.equal(after[key],before[key])
        const visible=await view(`${row(key==='configPath'?'configFile':key)}.querySelector('input').value`)
        await view('location.reload();true');await delay(1500)
        const reloaded=await snapshot(),visibleReload=await view(`${row(key==='configPath'?'configFile':key)}.querySelector('input').value`)
        assert.equal(reloaded[key],after[key]);assert.equal(visibleReload,visible)
        out.push({key,mode,writes,before:before[key],after:after[key],visible,visibleReload,reloaded:reloaded[key]})
      }
      await run(`__foundationIpc.removeHandler(${JSON.stringify(channel)});__foundationIpc.handle(${JSON.stringify(channel)},__foundationPicker);true`)
    }
    await run(`__foundationStore.set=__foundationSet;true`)
    // Restore fixture mutations after the isolated screen probes.
    await view(`window.electron.ipcRenderer.invoke('settings.setAll',{proxy:'',language:'en'})`)
    return out
  } finally {main.close()}
}
