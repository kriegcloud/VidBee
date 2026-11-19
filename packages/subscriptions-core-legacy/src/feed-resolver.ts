import * as Strict from '@vidbee/subscriptions-core/feed-resolver'
import type {ProfilePlatform} from './types.js'
export {buildFeedKey,resolveFeedFromInput,resolveProfileSource} from '@vidbee/subscriptions-core/feed-resolver'
export const profileFeedUrl:(platform:ProfilePlatform,owner:string)=>string=Strict.profileFeedUrl
