import * as S from "effect/Schema";

export class CaptureUnavailable extends S.TaggedError<CaptureUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/CaptureUnavailable"
)("CaptureUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class CaptureJobInvalid extends S.TaggedError<CaptureJobInvalid, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/CaptureJobInvalid"
)("CaptureJobInvalid", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class DisplayUnavailable extends S.TaggedError<DisplayUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/DisplayUnavailable"
)("DisplayUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class CaptureProcessFailure extends S.TaggedError<CaptureProcessFailure, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/CaptureProcessFailure"
)("CaptureProcessFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class PlaybackFailure extends S.TaggedError<PlaybackFailure, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/PlaybackFailure"
)("PlaybackFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class ProfileUnavailable extends S.TaggedError<ProfileUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/ProfileUnavailable"
)("ProfileUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class ProfileBusy extends S.TaggedError<ProfileBusy, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/ProfileBusy"
)("ProfileBusy", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class ProfileIdentityMismatch extends S.TaggedError<ProfileIdentityMismatch, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/ProfileIdentityMismatch"
)("ProfileIdentityMismatch", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class MediaUnavailable extends S.TaggedError<MediaUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/MediaUnavailable"
)("MediaUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class MediaTransferFailure extends S.TaggedError<MediaTransferFailure, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/MediaTransferFailure"
)("MediaTransferFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class BoundaryDecodeError extends S.TaggedError<BoundaryDecodeError, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/BoundaryDecodeError"
)("BoundaryDecodeError", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}

export class HostFailure extends S.TaggedError<HostFailure, { readonly brand: unique symbol }>(
  "@vidbee/browser-capture/HostFailure"
)("HostFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export type CaptureError =
  | CaptureUnavailable
  | CaptureJobInvalid
  | DisplayUnavailable
  | CaptureProcessFailure
  | PlaybackFailure
  | ProfileUnavailable
  | ProfileBusy
  | ProfileIdentityMismatch
  | MediaUnavailable
  | MediaTransferFailure
  | BoundaryDecodeError
  | HostFailure;

export const CaptureErrorSchema = S.Union([
  CaptureUnavailable,
  CaptureJobInvalid,
  DisplayUnavailable,
  CaptureProcessFailure,
  PlaybackFailure,
  ProfileUnavailable,
  ProfileBusy,
  ProfileIdentityMismatch,
  MediaUnavailable,
  MediaTransferFailure,
  BoundaryDecodeError,
  HostFailure,
]);
