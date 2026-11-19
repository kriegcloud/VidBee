import {LegacyTiming} from '@vidbee/task-queue/LegacyTiming.service'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scheduler from 'effect/Scheduler'
import { runLegacyPromise, runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { SubscriptionFeed } from '@vidbee/subscriptions-core/SubscriptionFeed.service'
import { SubscriptionFeedLive } from '@vidbee/subscriptions-core/SubscriptionFeed.layer'
import { RssParserLive } from '@vidbee/subscriptions-core/RssParser.driver'
import type { ParsedFeed } from './types.js'
import { CallerFeedSignal, feedHttpHost } from './FeedHttp.driver.js'
import { feedCancellationHost } from './FeedCancellation.driver.js'
import { hostLayers, legacyError } from './Host.driver.js'

import {discoverFeedUrls as discover} from '@vidbee/subscriptions-core/feed-parser'
export const discoverFeedUrls:(html:string,pageUrl:string)=>string[]=discover
export interface FeedFetcher {
  fetch(feedUrl: string, signal?: AbortSignal): Promise<ParsedFeed>
}

/** One warmed Effect owner and one lazily constructed XML parser per legacy fetcher. */
export class RssParserFeedFetcher implements FeedFetcher {
  private readonly runtime: ManagedRuntime.ManagedRuntime<SubscriptionFeed, never>
  private readonly cancellations: ReturnType<typeof feedCancellationHost>
  constructor() {
    this.cancellations = feedCancellationHost(operation => runLegacySync(this.runtime, operation, legacyError))
    const dependencies = Layer.mergeAll(
      Layer.succeed(LegacyTiming,LegacyTiming.of({turn:()=>Effect.callback(resume=>{queueMicrotask(()=>resume(Effect.void))})})),
      this.cancellations.layer,
      feedHttpHost(this.cancellations.signalFor),
      RssParserLive,
      hostLayers(operation => { void runLegacyPromise(this.runtime, operation, legacyError) }),
    )
    this.runtime = ManagedRuntime.make(SubscriptionFeedLive.pipe(
      Layer.provide(dependencies),
      Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield, true)),
    ))
    this.runtime.runSync(Effect.void)
  }
  fetch(feedUrl: string, signal?: AbortSignal): Promise<ParsedFeed> {
    const operation = Effect.suspend(() => {
      const borrowed = signal == null ? undefined : this.cancellations.borrow(signal)
      return Effect.flatMap(SubscriptionFeed, feed => feed.fetch(feedUrl, borrowed?.token)).pipe(
        Effect.onExit(() => borrowed?.dispose ?? Effect.void),
        Effect.provideService(CallerFeedSignal, signal),
      )
    })
    // The old declaration is narrower than rss-parser's permissive custom fields.
    return runLegacyPromise(this.runtime, operation, legacyError) as Promise<ParsedFeed>
  }
  probe(feedUrl: string, signal?: AbortSignal): Promise<{ feed: ParsedFeed; feedUrl: string; discovered: boolean }> {
    const operation = Effect.suspend(() => {
      const borrowed = signal == null ? undefined : this.cancellations.borrow(signal)
      return Effect.flatMap(SubscriptionFeed, feed => feed.probe(feedUrl, borrowed?.token)).pipe(
        Effect.onExit(() => borrowed?.dispose ?? Effect.void),
        Effect.provideService(CallerFeedSignal, signal),
      )
    })
    return runLegacyPromise(this.runtime, operation, legacyError) as Promise<{ feed: ParsedFeed; feedUrl: string; discovered: boolean }>
  }
}
