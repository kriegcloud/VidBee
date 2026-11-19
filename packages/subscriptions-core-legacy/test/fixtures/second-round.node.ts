import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as SqlClient from 'effect/sql/SqlClient'
import { BetterSqliteClient } from '@vidbee/db'
import { SUBSCRIPTIONS_DDL_V1, SUBSCRIPTIONS_DDL_V2, SUBSCRIPTIONS_V3_COLUMNS } from '@vidbee/db/subscriptions'
import { nodeLayer } from '../../../db/test/legacy/subscription-client.js'
import { SubscriptionStoreSqlLive } from '@vidbee/subscriptions-core/SubscriptionStore.layer'
import { SubscriptionStore } from '@vidbee/subscriptions-core/SubscriptionStore.service'
import { SubscriptionTimers } from '@vidbee/subscriptions-core/SubscriptionTimers.service'
import { SubscriptionEntropy } from '@vidbee/subscriptions-core/SubscriptionEntropy.service'
import * as current from '../../src/index.js'
const old=process.env.SECOND_OLD
const core=old?await import(pathToFileURL(old).href):current
const expected=readFileSync(new URL('../../../../.node-version',import.meta.url),'utf8').trim().replace(/^v/,'')
assert.equal(process.versions.node,expected)
const out:Record<string,unknown>={}
for(const mode of ['instance','subclass']) {
 const events:unknown[]=[]
 let tick:()=>void=()=>{throw new Error('missing scheduler callback')}
 const methods={
  reconcileOrphanedTasks:async function(this:unknown){events.push(['reconcile',this===api]);return 0},
  refreshAll:async function(this:unknown,...args:unknown[]){events.push(['all',this===api,args])},
  refreshOne:async function(this:unknown,...args:unknown[]){events.push(['one',this===api,args])},
  releaseRemovedTasks:async function(this:unknown,...args:unknown[]){events.push(['release',this===api,args]);return 0},
 }
 class OverrideApi extends core.SubscriptionsApi {}
 if(mode==='subclass')Object.assign(OverrideApi.prototype,methods)
 const store={list:async()=>[],get:async(id:string)=>{events.push(['get',id]);return {id,items:[]}},update:async()=>null,clearQueueLinks:async()=>0,clearOrphanedQueueLinks:async()=>{events.push('native reconcile');return 0}}
 const api=new (mode==='subclass'?OverrideApi:core.SubscriptionsApi)({store,metaStore:new core.InMemoryMetaStore(),fetcher:{fetch:async()=>({items:[]})},kind:'desktop',pid:1,enqueueItem:async()=>null,now:()=>1000,leader:{scheduleInterval:()=>1,clearInterval:()=>{}},scheduler:{setTimeoutImpl:(cb:()=>void)=>{events.push('schedule');tick=cb;return 1},clearTimeoutImpl:()=>events.push('clear')}})
 if(mode==='instance')Object.assign(api,methods)
 await api.start();events.push('started')
 tick();await new Promise(resolve=>setImmediate(resolve));events.push('ticked')
 await api.refresh({id:'s'});events.push('refreshed')
 api.noteTaskRemoved('t1');await new Promise(resolve=>setImmediate(resolve));events.push('flushed')
 await api.stop()
 out[mode]=events
}
for(const mode of ['instance','subclass']) {
 const events:unknown[]=[]
 class Api extends core.SubscriptionsApi { constructor(options: unknown) { super(options) } }
 const refreshOne=async function(this:unknown,id:string){events.push(['one',this===api,id])}
 if(mode==='subclass')Object.assign(Api.prototype,{refreshOne})
 const api=new Api({store:{list:async()=>[{id:'s',enabled:true,sourceKind:'feed'}]},metaStore:new core.InMemoryMetaStore(),fetcher:{fetch:async()=>({items:[]})},kind:'desktop',pid:1,enqueueItem:async()=>null,now:()=>1000})
 if(mode==='instance')api.refreshOne=refreshOne
 await api.refreshAll({force:true})
 let heartbeat:()=>void=()=>{throw new Error('missing heartbeat')}
 class Leader extends core.LeaderElection { constructor(options: unknown) { super(options) } }
 const beat=async function(this:unknown){events.push(['heartbeat',this===leader]);return true}
 if(mode==='subclass')Object.assign(Leader.prototype,{heartbeat:beat})
 const leader=new Leader({metaStore:new core.InMemoryMetaStore(),kind:'desktop',pid:1,now:()=>1000,scheduleInterval:(cb:()=>void)=>{heartbeat=cb;return 1},clearInterval:()=>{}})
 await leader.tryAcquire()
 if(mode==='instance')leader.heartbeat=beat
 heartbeat();await new Promise(resolve=>setImmediate(resolve));await leader.release()
 const previous=globalThis.fetch
 globalThis.fetch=async()=>new Response('<html><link rel="alternate" type="application/rss+xml" href="/candidate"></html>',{status:200})
 try {
  class Fetcher extends core.RssParserFeedFetcher {}
  const fetch=async function(this:unknown,...args:unknown[]){events.push(['fetch',this===fetcher,args.map(a=>a===undefined?'undefined':a)]);return {title:'override',items:[]}}
  if(mode==='subclass')Object.assign(Fetcher.prototype,{fetch})
  const fetcher=new Fetcher()
  if(mode==='instance')fetcher.fetch=fetch
  await fetcher.probe('https://fixture.invalid/page')
 } finally {globalThis.fetch=previous}
 out['neighbors:'+mode]=events
}
for (const awaits of [false,true]) {
 const handle=new Database(':memory:')
 const ddl=[SUBSCRIPTIONS_DDL_V1,SUBSCRIPTIONS_DDL_V2,...SUBSCRIPTIONS_V3_COLUMNS.map(([c,d])=>`ALTER TABLE subscriptions ADD COLUMN ${c} ${d}`),...['download_type','download_quality','download_container'].map(c=>`ALTER TABLE subscriptions ADD COLUMN ${c} TEXT`)].flatMap(sql=>sql.split(';').map(s=>s.trim()).filter(Boolean))
 for(const sql of ddl)handle.exec(sql)
 const events:unknown[]=[]
 let recording=false
 const now=()=>{if(recording)events.push('now');return 1000}
 const native=!old&&process.env.SECOND_NATIVE==='1'
 const runtime=ManagedRuntime.make(SubscriptionStoreSqlLive.pipe(Layer.provideMerge(Layer.mergeAll(
  process.env.SECOND_CLIENT==='node'?nodeLayer(':memory:'):BetterSqliteClient.layerFromHandle(handle),
  Layer.succeed(SubscriptionTimers,{now:Effect.sync(now),after:()=>Effect.succeed(Effect.void),every:()=>Effect.succeed(Effect.void)}),
  Layer.succeed(SubscriptionEntropy,{subscriptionId:Effect.succeed('s'),leaseId:Effect.succeed('lease'),next:Effect.succeed(0.5)})
 ))))
 if(native&&process.env.SECOND_CLIENT==='node')await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient,sql=>Effect.forEach(ddl,s=>sql.unsafe(s))))
 const service=native?await runtime.runPromise(SubscriptionStore):undefined
 const legacy=core.createSqliteSubscriptionsStore({db:drizzle({client:handle}),now,generateId:()=> 's'})
 const add=()=>service?runtime.runPromise(service.add({sourceUrl:'u',feedUrl:'f',platform:'custom'})):legacy.add({sourceUrl:'u',feedUrl:'f',platform:'custom'})
 const mark=(id:string,task:string|null)=>service?runtime.runPromise(service.markItemQueued('s',id,task)):legacy.markItemQueued('s',id,task)
 const get=()=>service?runtime.runPromise(service.get('s')):legacy.get('s')
 await add()
 await mark('a',awaits?'old':null)
 await mark('b','seed')
 const execute=(statement:string)=>service?runtime.runPromise(Effect.flatMap(SqlClient.SqlClient,sql=>sql.unsafe(statement))):Promise.resolve(handle.exec(statement))
 await execute("UPDATE subscription_items SET added=1,task_id=NULL WHERE item_id='b'"+(awaits?'':" OR item_id='a'"))
 recording=true
 const live=async(task:string)=>{events.push(['live',task]);await mark('b','task2');events.push('marked during await');return false}
 const count=service?await runtime.runPromise(service.clearOrphanedQueueLinks(id=>Effect.callback(resume=>{live(id).then(value=>resume(Effect.succeed(value)))}))):await legacy.clearOrphanedQueueLinks(live)
 if(!awaits)await mark('b','task2')
 const result=await get()
 out['orphan:'+awaits]={events,count,items:result?.items.map((i:{id:string;addedToQueue:boolean;taskId?:string})=>({id:i.id,added:i.addedToQueue,taskId:i.taskId??null}))}
 await runtime.dispose();handle.close()
}
const file=new URL('./second-round.json',import.meta.url)
if(old)writeFileSync(file,JSON.stringify(out,null,2)+'\n')
else assert.deepEqual(out,JSON.parse(readFileSync(file,'utf8')))
console.log(JSON.stringify({cases:Object.keys(out).length,differences:0}))
