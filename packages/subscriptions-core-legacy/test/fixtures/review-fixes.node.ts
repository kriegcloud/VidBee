import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as SqlClient from "effect/sql/SqlClient"
import { nodeLayer } from "../../../db/test/legacy/subscription-client.js"
import * as ManagedRuntime from 'effect/ManagedRuntime'
import { BetterSqliteClient } from '@vidbee/db'
import { SUBSCRIPTIONS_DDL_V1, SUBSCRIPTIONS_DDL_V2, SUBSCRIPTIONS_V3_COLUMNS } from '@vidbee/db/subscriptions'
import { SubscriptionStoreSqlLive } from '@vidbee/subscriptions-core/SubscriptionStore.layer'
import { Subscriptions } from "@vidbee/subscriptions-core/Subscriptions.service"
import { SubscriptionStore } from '@vidbee/subscriptions-core/SubscriptionStore.service'
import { SubscriptionTimers } from '@vidbee/subscriptions-core/SubscriptionTimers.service'
import { SubscriptionEntropy } from '@vidbee/subscriptions-core/SubscriptionEntropy.service'
import * as current from '../../src/index.js'
import { resolveSubscriptionItemStatus } from '../../src/status.js'

if (process.versions.bun || process.version !== 'v'+readFileSync(new URL('../../../../.node-version',import.meta.url),'utf8').trim().replace(/^v/,'')) throw new Error('Pinned Node required')
const old = process.env.REVIEW_OLD
const core = old ? await import(pathToFileURL(old).href) : {...current, resolveSubscriptionItemStatus}
const scalars: unknown[] = [null, NaN, 0, 1, 42, '', 'x', true, false, undefined]
const storeFields = ['id','title','sourceUrl','feedUrl','platform','keywords','tags','onlyDownloadLatest','autoDownload','enabled','coverUrl','latestVideoTitle','latestVideoPublishedAt','lastCheckedAt','lastSuccessAt','status','lastError','createdAt','updatedAt','downloadDirectory','namingTemplate','sourceKind','profileOwner','categories','checkIntervalMs','nextCheckAt','downloadType','downloadQuality','downloadContainer']
const apiFields = ['platform','title','feedUrl','sourceUrl','enabled','autoDownload','onlyDownloadLatest','keywords','tags','downloadDirectory','namingTemplate','downloadType','downloadQuality','downloadContainer','categories','checkIntervalMs']
const encode = (value:unknown):unknown => {
 if(value===undefined)return {$scalar:'undefined'}
 if(typeof value==='number'&&Number.isNaN(value))return {$scalar:'NaN'}
 if(Array.isArray(value))return value.map(encode)
 if(value!==null&&typeof value==='object')return Object.entries(value).map(([k,v])=>[k,encode(v)])
 return value
}
const part=process.env.REVIEW_PART
const out: Record<string,unknown> = {}
if(!part||part==='status')for (const value of scalars) out['status:'+String(value)] = core.resolveSubscriptionItemStatus({addedToQueue:true,taskId:'task'},new Map([['task',value]]))
if(!part||part==='timers')for (const handle of [null,undefined,0,false,'']) {
 const events:unknown[]=[]
 const scheduler=new core.FeedCheckScheduler({runAll:async()=>{},runOne:async()=>{},isLeader:()=>true,setTimeoutImpl:()=>handle,clearTimeoutImpl:(h:unknown)=>events.push(h)})
 scheduler.start();scheduler.start();scheduler.stop()
 out['timer:'+String(handle)]=encode(events)
}
if(!part||part==='probe'){
 const previous=globalThis.fetch
 const calls:unknown[]=[]
 globalThis.fetch=async()=>new Response('<html><link rel="alternate" type="application/rss+xml" href="/candidate"></html>',{status:200})
 try {
  const fetcher=new core.RssParserFeedFetcher()
  fetcher.fetch=async function(url:string,signal:AbortSignal|undefined){calls.push([this===fetcher,url,signal===undefined]);return {title:'override',items:[]}}
  out.probe=encode({result:await fetcher.probe('https://fixture.invalid/page'),calls})
 } finally {globalThis.fetch=previous}
}
if(!part||part==='overrides'){
 let callback:()=>void=()=>{throw new Error('No heartbeat callback')}
 const calls:unknown[]=[]
 const leader=new core.LeaderElection({metaStore:new core.InMemoryMetaStore(),kind:'desktop',pid:1,now:()=>1000,scheduleInterval:(cb:()=>void)=>{callback=cb;return 1},clearInterval:()=>{}})
 await leader.tryAcquire()
 leader.heartbeat=async function(){calls.push(this===leader);return true}
 callback();await new Promise(resolve=>setImmediate(resolve))
 await leader.release()
 out.heartbeatOverride=encode(calls)
 const store={list:async()=>[{id:'subscription',enabled:true,sourceKind:'feed'}]}
 const api=new core.SubscriptionsApi({store,metaStore:new core.InMemoryMetaStore(),fetcher:{fetch:async()=>({items:[]})},kind:'desktop',pid:1,enqueueItem:async()=>null,now:()=>1000})
 api.refreshOne=async function(id:string){calls.push([this===api,id])}
 await api.refreshAll({force:true})
 out.refreshOverride=encode(calls)
}
if(!part||part==='matrix')for (const level of ['store','api']) for (const field of level==='store'?storeFields:apiFields) for (const [index,value] of scalars.entries()) {
 const handle=new Database(':memory:')
 handle.exec(SUBSCRIPTIONS_DDL_V1);handle.exec(SUBSCRIPTIONS_DDL_V2)
 for(const [column,definition] of SUBSCRIPTIONS_V3_COLUMNS)handle.exec(`ALTER TABLE subscriptions ADD COLUMN ${column} ${definition}`)
 for(const column of ['download_type','download_quality','download_container'])handle.exec(`ALTER TABLE subscriptions ADD COLUMN ${column} TEXT`)
 let runtime:ManagedRuntime.ManagedRuntime<SubscriptionStore | SqlClient.SqlClient | SubscriptionTimers | SubscriptionEntropy,import("effect/sql/SqlError").SqlError>|undefined
 let store
 if(old || process.env.REVIEW_NATIVE!=='1')store=core.createSqliteSubscriptionsStore({db:drizzle({client:handle}),now:()=>1000,generateId:()=> 'subscription'})
 else {
  const hosts=Layer.mergeAll(process.env.REVIEW_SQL_CLIENT === "node" ? nodeLayer(":memory:") : BetterSqliteClient.layerFromHandle(handle),Layer.succeed(SubscriptionTimers,{now:Effect.succeed(1000),after:()=>Effect.succeed(Effect.void),every:()=>Effect.succeed(Effect.void)}),Layer.succeed(SubscriptionEntropy,{subscriptionId:Effect.succeed('subscription'),leaseId:Effect.succeed('lease'),next:Effect.succeed(0.5)}))
  const owner=ManagedRuntime.make(SubscriptionStoreSqlLive.pipe(Layer.provideMerge(hosts)))
  runtime=owner
  if(process.env.REVIEW_SQL_CLIENT === "node")await owner.runPromise(Effect.flatMap(SqlClient.SqlClient, sql => Effect.forEach([
    SUBSCRIPTIONS_DDL_V1,SUBSCRIPTIONS_DDL_V2,...SUBSCRIPTIONS_V3_COLUMNS.map(([column,definition])=>`ALTER TABLE subscriptions ADD COLUMN ${column} ${definition}`),...['download_type','download_quality','download_container'].map(column=>`ALTER TABLE subscriptions ADD COLUMN ${column} TEXT`)
  ].flatMap(statement=>statement.split(";").map(part=>part.trim()).filter(Boolean)), statement=>sql.unsafe(statement))))
  const native=await owner.runPromise(SubscriptionStore)
  store={
   add:(...args:Parameters<typeof native.add>)=>owner.runPromise(native.add(...args)),
   update:(...args:Parameters<typeof native.update>)=>owner.runPromise(native.update(...args)),
   get:(...args:Parameters<typeof native.get>)=>owner.runPromise(native.get(...args)),
   findDuplicateFeed:(...args:Parameters<typeof native.findDuplicateFeed>)=>owner.runPromise(native.findDuplicateFeed(...args)),
   remove:(...args:Parameters<typeof native.remove>)=>owner.runPromise(native.remove(...args)),
   replaceItems:(...args:Parameters<typeof native.replaceItems>)=>owner.runPromise(native.replaceItems(...args)),
   mergeItems:(...args:Parameters<typeof native.mergeItems>)=>owner.runPromise(native.mergeItems(...args)),
   markItemQueued:(...args:Parameters<typeof native.markItemQueued>)=>owner.runPromise(native.markItemQueued(...args)),
   clearQueueLinks:(...args:Parameters<typeof native.clearQueueLinks>)=>owner.runPromise(native.clearQueueLinks(...args)),
   clearOrphanedQueueLinks:(...args:Parameters<typeof native.clearOrphanedQueueLinks>)=>owner.runPromise(native.clearOrphanedQueueLinks(...args)),
   list:()=>owner.runPromise(native.list)
  }
 }
 const read=async()=>runtime ? runtime.runPromise(Effect.flatMap(SqlClient.SqlClient,sql=>sql`SELECT * FROM subscriptions ORDER BY id`)) : handle.prepare('SELECT * FROM subscriptions ORDER BY id').all()
 try {
  await store.add({sourceUrl:'https://fixture.invalid/source',feedUrl:'https://fixture.invalid/feed',platform:'custom'})
  if(!part && level==='store' && field==='title' && index===0) {
   handle.prepare('DELETE FROM subscriptions').run()
   if(runtime)await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient,sql=>sql`DELETE FROM subscriptions`))
   const created=await store.add({sourceUrl:'https://fixture.invalid/add',feedUrl:'https://fixture.invalid/add-feed',platform:'custom',title:null})
   out.addNullTitle=encode(created)
   handle.prepare('DELETE FROM subscriptions').run()
   if(runtime)await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient,sql=>sql`DELETE FROM subscriptions`))
   await store.add({sourceUrl:'https://fixture.invalid/source',feedUrl:'https://fixture.invalid/feed',platform:'custom'})
  }
  const before=encode(await read())
  let result:unknown
  try {
   if(level==='store')result=await store.update('subscription',{[field]:value})
   else {
    const api=new core.SubscriptionsApi({store,metaStore:new core.InMemoryMetaStore(),fetcher:{fetch:async()=>({items:[]})},kind:'desktop',pid:1,enqueueItem:async()=>null,now:()=>1000})
    result=process.env.REVIEW_NATIVE==='1' && !old ? await Reflect.get(api,'runtime').runPromise(Effect.flatMap(Subscriptions, service => service.update({id:'subscription',[field]:value}))) : await api.update({id:'subscription',[field]:value})
   }
   out[`${level}:${field}:${index}`]={value:encode(result),rows:encode(await read())}
  }catch(error){
   assert.deepEqual(encode(await read()),before,`${level}:${field}:${index} failed after writing`)
   if(!old && process.env.REVIEW_NATIVE==='1') assert(error!==null&&typeof error==='object'&&'_tag' in error,`${field} needs typed failure`)
   out[`${level}:${field}:${index}`]={threw:true,unchanged:true}
  }
 }finally {if(runtime)await runtime.dispose();handle.close()}
}
const file=new URL('./review-fixes.json',import.meta.url)
if(old)writeFileSync(file,JSON.stringify(out,null,2)+'\n')
else {const expected=JSON.parse(readFileSync(file,'utf8'));for(const [key,value] of Object.entries(out))assert.deepEqual(value,expected[key],key);if(!part)assert.equal(Object.keys(out).length,Object.keys(expected).length)}
console.log(JSON.stringify({cases:Object.keys(out).length,native:process.env.REVIEW_NATIVE==='1',differences:0}))
