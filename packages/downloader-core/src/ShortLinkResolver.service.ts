import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

/** One-step short-link expansion fails open to the caller's original URL. */
export class ShortLinkResolver extends Context.Service<
  ShortLinkResolver,
  { readonly expand: (value: string, timeoutMs?: number) => Effect.Effect<string> }
>()("@vidbee/downloader-core/ShortLinkResolver.service/ShortLinkResolver") {}
