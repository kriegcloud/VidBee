import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import * as Effect from 'effect/Effect'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { runLegacySync, runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { Models } from '../../transcription/src/Models.service'
import { transcriptionCause } from '../src/bridge/errors'
import { ModelManager, modelsLayerFor } from '../src/model-manager'
import { HostFailure } from '../../transcription/src/Transcription.errors'
import type { ModelStatus } from '../src/types'

test('a borrowed manager enters its existing owner and callbacks synchronously re-enter the subscriber owner', {timeout:30000}, async t=>{
 const root=mkdtempSync(join(tmpdir(),'model-owner-'));t.after(()=>rmSync(root,{recursive:true,force:true}))
 const manager=new ModelManager({modelsDir:root,catalog:[{id:'fixture',fileName:'tiny/model',url:'https://fixture.invalid/model',required:true,group:'asr',role:'asr-model',tier:'minimal'}],resolveUrls:spec=>[spec.url],fetchImpl:async()=>new Response('fixture')})
 const trace:string[]=[]
 const ensure=manager.ensureReady.bind(manager)
 manager.ensureReady=options=>{trace.push('manager:ensure');return ensure(options)}
 let receiver:ManagedRuntime.ManagedRuntime<Models,never>
 receiver=ManagedRuntime.make(modelsLayerFor(manager,effect=>runLegacySync(receiver,effect,transcriptionCause)))
 try {
  const service=runLegacySync(receiver,Models,transcriptionCause)
  let calls=0
  const emit=(status:ModelStatus):Effect.Effect<void,HostFailure>=>Effect.sync(()=>{
   trace.push('receiver:callback');calls+=1;assert.equal(manager.status().ready,status.ready)
  })
  const unsubscribe=runLegacySync(receiver,service.subscribe({emit}),transcriptionCause)
  const stale=runLegacySync(receiver,service.subscribe({emit}),transcriptionCause)
  manager.cancelDownload('minimal');trace.push('returned')
  assert.equal(calls,1);assert.deepEqual(trace,['receiver:callback','returned'])
  runLegacySync(receiver,unsubscribe,transcriptionCause)
  runLegacySync(receiver,service.subscribe({emit}),transcriptionCause)
  runLegacySync(receiver,stale,transcriptionCause)
  manager.cancelDownload('minimal');assert.equal(calls,1)
  const ready=await runLegacyPromise(receiver,service.ensureReady({tiers:['minimal']}),transcriptionCause)
  assert.equal(ready.ready,true);assert.equal(trace.filter(item=>item==='manager:ensure').length,1)
  assert.equal(service.modelsDir,manager.modelsDir)
  const sentinel=new Error('listener identity')
  runLegacySync(receiver,service.subscribe({emit:()=>Effect.try({try:()=>{throw sentinel},catch:cause=>HostFailure.make({operation:'listener',cause,legacyMessage:'listener identity'})})}),transcriptionCause)
  assert.throws(()=>manager.cancelDownload('minimal'),error=>error===sentinel)
 } finally { await receiver.dispose() }
})

for(const thrown of [undefined,null,false,7,'scalar','incomplete model: scalar'])test(`model terminal listener normalization retains Error for ${String(thrown)}`,{timeout:30000},async t=>{
 const root=mkdtempSync(join(tmpdir(),'model-listener-value-'));t.after(()=>rmSync(root,{recursive:true,force:true}))
 const manager=new ModelManager({modelsDir:root,catalog:[{id:'fixture',fileName:'model',url:'https://fixture.invalid/model',required:true,group:'asr',role:'asr-model',tier:'minimal'}],resolveUrls:spec=>[spec.url],fetchImpl:async()=>new Response('fixture')})
 manager.subscribe(()=>{throw thrown})
 await assert.rejects(manager.ensureReady({tiers:['minimal']}),error=>error instanceof Error&&error.constructor===Error&&error.message===String(thrown))
})
