import { encode } from './pure-oracle'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { SubscriptionsApi } from '@vidbee/subscriptions-core-legacy/api'
import { InMemoryMetaStore } from '@vidbee/subscriptions-core-legacy/store'
import { setup, baseInput, serialize } from './store-scenario'
assert.equal(process.version, 'v22.23.4', 'Record only under the pinned Node')
const { handle, store } = setup()
try {
 const sub = await store.add(baseInput)
 await store.update(sub.id, {status:'failed',lastError:'direct boom'})
 await store.update(sub.id,{status:'up-to-date',lastError:undefined})
 const direct = {row:await store.get(sub.id),raw:handle.prepare('SELECT last_error FROM subscriptions').get()}
 let fails=true
 const api=new SubscriptionsApi({kind:'desktop',pid:1,store,metaStore:new InMemoryMetaStore(),now:()=>200,enqueueItem:async()=>null,fetcher:{fetch:async()=>{if(fails)throw new Error('fetch boom');return {items:[]}}}})
 await api.refreshOne(sub.id);const failed=await store.get(sub.id);fails=false;await api.refreshOne(sub.id)
 const success={row:await store.get(sub.id),raw:handle.prepare('SELECT last_error FROM subscriptions').get()}
 writeFileSync(new URL('./audit-store-stale.json',import.meta.url),serialize({direct,failed,success})+'\n')
}finally{handle.close()}
const second=setup()
try{
 const api=new SubscriptionsApi({kind:'desktop',pid:1,store:second.store,metaStore:new InMemoryMetaStore(),now:()=>200,enqueueItem:async()=>null,fetcher:{fetch:async()=>({items:[]})},profileFetcher:{fetch:async()=>({items:[],categoryErrors:{}})}})
 const observations:unknown[]=[]
 for(const patch of [{categories:null},{platform:'instagram',categories:null},{keywords:'a'}]){try{observations.push({input:patch,value:await Reflect.apply(api.add,api,[{...baseInput,feedUrl:`https://fixture.invalid/${observations.length}`,...patch}])})}catch(error){assert.ok(error instanceof TypeError);observations.push({input:patch,engine:true,failed:true,name:error.name,message:error.message})}}
 const profile=await api.add({...baseInput,feedUrl:'profile',platform:'instagram',categories:['posts']})
 for(const patch of [{categories:'posts'},{enabled:'true'},{checkIntervalMs:0},{checkIntervalMs:false},{checkIntervalMs:''},{feedUrl:''}]){try{observations.push({input:patch,value:await Reflect.apply(api.update,api,[{id:profile.id,...patch}])})}catch(error){assert.ok(error instanceof TypeError);observations.push({input:patch,engine:true,failed:true,name:error.name,message:error.message})}}
 writeFileSync(new URL('./audit-store-json.json',import.meta.url),serialize(encode(observations))+'\n')
}finally{second.handle.close()}
