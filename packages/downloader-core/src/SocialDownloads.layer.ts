import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SocialDownloads } from "./SocialDownloads.service.js";
import {
  downloadSocialMedia,
  inspectSocialMedia,
  mapSocialMediaProfile,
  previewSocialMedia,
  restoreSocialMediaGroupCaps,
} from "./social-media-service.js";

type Dependencies = Effect.Services<
  | ReturnType<typeof inspectSocialMedia>
  | ReturnType<typeof previewSocialMedia>
  | ReturnType<typeof mapSocialMediaProfile>
  | ReturnType<typeof downloadSocialMedia>
  | ReturnType<typeof restoreSocialMediaGroupCaps>
>;

/** Capture native dependencies once; operations keep their original ordering and timing. */
export const SocialDownloadsLive = Layer.effect(
  SocialDownloads,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<Dependencies>();
    return SocialDownloads.of({
      inspect: Effect.fn("SocialDownloads.inspect")((...args) =>
        inspectSocialMedia(...args).pipe(Effect.provide(dependencies))
      ),
      preview: Effect.fn("SocialDownloads.preview")((...args) =>
        previewSocialMedia(...args).pipe(Effect.provide(dependencies))
      ),
      map: Effect.fn("SocialDownloads.map")((...args) =>
        mapSocialMediaProfile(...args).pipe(Effect.provide(dependencies))
      ),
      download: Effect.fn("SocialDownloads.download")((...args) =>
        downloadSocialMedia(...args).pipe(Effect.provide(dependencies))
      ),
      restore: restoreSocialMediaGroupCaps().pipe(Effect.provide(dependencies)),
    });
  })
);
