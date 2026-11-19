import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type {
  downloadSocialMedia,
  inspectSocialMedia,
  mapSocialMediaProfile,
  previewSocialMedia,
  restoreSocialMediaGroupCaps,
} from "./social-media-service.js";

type Operation<A> = Effect.Effect<Effect.Success<A>, Effect.Error<A>>;
/** Social download operations share the executor, borrowed queue and admission capabilities. */
export class SocialDownloads extends Context.Service<
  SocialDownloads,
  {
    readonly inspect: (
      ...args: Parameters<typeof inspectSocialMedia>
    ) => Operation<ReturnType<typeof inspectSocialMedia>>;
    readonly preview: (
      ...args: Parameters<typeof previewSocialMedia>
    ) => Operation<ReturnType<typeof previewSocialMedia>>;
    readonly map: (
      ...args: Parameters<typeof mapSocialMediaProfile>
    ) => Operation<ReturnType<typeof mapSocialMediaProfile>>;
    readonly download: (
      ...args: Parameters<typeof downloadSocialMedia>
    ) => Operation<ReturnType<typeof downloadSocialMedia>>;
    readonly restore: Operation<ReturnType<typeof restoreSocialMediaGroupCaps>>;
  }
>()("@vidbee/downloader-core/SocialDownloads.service/SocialDownloads") {}
