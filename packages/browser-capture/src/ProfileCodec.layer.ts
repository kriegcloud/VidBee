import * as OnlyFans from "@vidbee/downloader-core/onlyfans-profile";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { ProfileCodec } from "./BrowserProfiles.service.js";
import { BoundaryDecodeError } from "./Capture.errors.js";

const failure = (cause: unknown) =>
  BoundaryDecodeError.make({ operation: "profile decode", legacyMessage: "Invalid browser-capture data.", cause });
export const ProfileCodecLive = Layer.succeed(ProfileCodec, {
  read: Effect.fn("ProfileCodec.read")((text) =>
    S.decodeEffect(S.fromJsonString(OnlyFans.OnlyFansProfileSchema))(text).pipe(Effect.mapError(failure))
  ),
  command: Effect.fn("ProfileCodec.command")((input) =>
    S.decodeEffect(OnlyFans.OnlyFansCommandSchema)(input).pipe(Effect.mapError(failure))
  ),
  download: Effect.fn("ProfileCodec.download")((input) =>
    S.decodeEffect(OnlyFans.OnlyFansDownloadSchema)(input).pipe(Effect.mapError(failure))
  ),
});
