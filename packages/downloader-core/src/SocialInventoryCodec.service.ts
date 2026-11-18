import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { BoundaryDecodeError } from "./Downloader.errors.js";
import { SocialMappedProfileSchema } from "./ProfilePersistence.model.js";
import type { HostFailure } from "./Downloader.errors.js";
import type { SocialMappedProfile } from "./ProfilePersistence.model.js";

/** Compatibility retains the old public syntax and validation error objects. */
export class SocialInventoryCodec extends Context.Service<
  SocialInventoryCodec,
  {
    readonly decode: (text: string) => Effect.Effect<SocialMappedProfile, BoundaryDecodeError | HostFailure>;
  }
>()("@vidbee/downloader-core/SocialInventoryCodec.service/SocialInventoryCodec") {}
export const SocialInventoryCodecLive = Layer.succeed(SocialInventoryCodec, {
  decode: Effect.fn("SocialInventoryCodec.decode")((text) =>
    S.decodeEffect(S.fromJsonString(SocialMappedProfileSchema))(text).pipe(
      Effect.mapError((cause) =>
        BoundaryDecodeError.make({ operation: "social.read", legacyMessage: cause.message, cause })
      )
    )
  ),
});
