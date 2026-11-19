import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { RawParsedFeed } from "./Feed.model.js";
import type { FeedParseFailure } from "./Subscriptions.errors.js";
export class RssParser extends Context.Service<
  RssParser,
  {
    readonly parse: (xml: string) => Effect.Effect<RawParsedFeed, FeedParseFailure>;
  }
>()("@vidbee/subscriptions-core/RssParser.service/RssParser") {}
