import { computeBackoffMs as nativeBackoff } from '@vidbee/task-queue/scheduler'
export function computeBackoffMs(attempt:number,suggestedMs:number|null,rng:()=>number=Math.random):number { return nativeBackoff(attempt,suggestedMs,rng) }
