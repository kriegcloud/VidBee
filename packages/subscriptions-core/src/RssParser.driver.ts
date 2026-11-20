import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import Parser from "rss-parser";
import { RSS_FETCH_HEADERS } from "./FeedHttp.layer.js";
import { RssParser } from "./RssParser.service.js";
import { FeedParseFailure } from "./Subscriptions.errors.js";
export const RssParserLive = Layer.sync(RssParser, () => {
  let parser: Parser | undefined;
  return {
    parse: Effect.fn("RssParser.parse")((xml: string) =>
      Effect.tryPromise({
        try: () => {
          parser ??= new Parser({
            customFields: {
              item: [
                ["yt:videoId", "youtubeId"],
                ["media:thumbnail", "mediaThumbnail"],
                ["media:content", "mediaContent"],
                ["enclosure", "enclosure"],
                ["content:encoded", "contentEncoded"],
                ["description", "description"],
              ],
            },
            headers: RSS_FETCH_HEADERS,
            timeout: 180_000,
            maxRedirects: 20,
            defaultRSS: 2,
          });
          return parser.parseString(xml);
        },
        catch: (original) =>
          FeedParseFailure.make({
            original,
            legacyMessage: original instanceof Error ? original.message : String(original),
          }),
      })
    ),
  };
});
