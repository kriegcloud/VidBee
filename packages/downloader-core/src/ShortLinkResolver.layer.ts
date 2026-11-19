import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import { ShortLinkResolver } from "./ShortLinkResolver.service.js";
import { expandTikTokShortLink } from "./tiktok-short-link.js";

export const ShortLinkResolverLive = Layer.effect(
  ShortLinkResolver,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return ShortLinkResolver.of({
      expand: Effect.fn("ShortLinkResolver.expand")((value, timeoutMs) =>
        expandTikTokShortLink(value, timeoutMs).pipe(Effect.provideService(HttpClient.HttpClient, client))
      ),
    });
  })
);
