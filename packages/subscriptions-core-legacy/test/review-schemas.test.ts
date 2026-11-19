import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import * as S from 'effect/Schema'
import * as R from 'effect/Result'
import * as Models from '../../subscriptions-core/src/Subscription.model.js'
import {schemaCases} from './fixtures/schema-oracle.js'
import {encode} from './fixtures/pure-oracle.js'

const frozen=JSON.parse(readFileSync(new URL('./fixtures/schema-oracle.json',import.meta.url),'utf8'))
const declaredChanges=JSON.parse(readFileSync(new URL('./fixtures/model-schema-changes.json',import.meta.url),'utf8'))
const modelBySchema={
 SubscriptionPlatformSchema:Models.SubscriptionPlatform,
 SubscriptionSourceKindSchema:Models.SubscriptionSourceKind,
 SubscriptionStatusSchema:Models.SubscriptionStatus,
 LeaderKindSchema:Models.LeaderKind,
 ResolvedFeedSchema:Models.ResolvedFeed,
 SubscriptionRuleSchema:Models.SubscriptionRule,
 SubscriptionFeedItemSchema:Models.SubscriptionFeedItem,
 SubscriptionWithItemsSchema:Models.SubscriptionWithItems,
 SubscriptionCreateInputSchema:Models.SubscriptionCreateInput,
 SubscriptionUpdateInputSchema:Models.SubscriptionUpdateInput,
 SubscriptionListOutputSchema:Models.SubscriptionListOutput,
 SubscriptionItemsListOutputSchema:Models.SubscriptionItemsListOutput,
 ItemsQueueOutputSchema:Models.ItemsQueueOutput,
 LeaderStateSchema:Models.LeaderState
}
// Section 3 explicitly removes these unused runtime refinements from domain models.
// No mismatched type, literal, required property or nonfinite value is excused here.
function declaredRefinement(issue:{code:string;expected?:string;format?:string}):boolean {
 return issue.code==='too_small'||issue.code==='too_big'||issue.code==='invalid_format'||
  (issue.code==='invalid_type'&&issue.expected==='int'&&issue.format==='safeint')
}
describe('Effect models against pre-port zod acceptance and decoded values',()=>{
 for(const entry of schemaCases()){
  const schema=Reflect.get(modelBySchema,entry.schema)
  if(schema===undefined)continue // Deleted endpoint-only schemas have no replacement model.
  it(entry.name,()=>{
   const old=frozen[entry.name]
   const next=S.decodeUnknownResult(schema)(entry.input)
   if(old.success){
    expect(R.isSuccess(next)).toBe(true)
    if(R.isSuccess(next))expect(encode(next.success)).toEqual(old.value)
   }else if(R.isSuccess(next)){
    expect(old.issues.length).toBeGreaterThan(0)
    expect(old.issues.every(declaredRefinement),'only explicitly removed refinements may differ').toBe(true)
    expect(declaredChanges[entry.name], 'each declared change is explicitly inventoried').toBeDefined()
    expect(encode(next.success)).toEqual(declaredChanges[entry.name].value)
   }else expect(R.isFailure(next)).toBe(true)
  },30000)
 }
})
