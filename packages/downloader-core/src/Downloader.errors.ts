import * as S from "effect/Schema";

export class InvalidDownload extends S.TaggedError<InvalidDownload, { readonly brand: unique symbol }>(
  "@vidbee/downloader-core/InvalidDownload"
)("InvalidDownload", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class BinaryUnavailable extends S.TaggedError<BinaryUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/downloader-core/BinaryUnavailable"
)("BinaryUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class MetadataFailure extends S.TaggedError<MetadataFailure, { readonly brand: unique symbol }>(
  "@vidbee/downloader-core/MetadataFailure"
)("MetadataFailure", {
  operation: S.String,
  legacyMessage: S.String,
  jsonInput: S.optional(S.String),
  cause: S.optional(S.Defect()),
}) {}
export class ProfileUnavailable extends S.TaggedError<ProfileUnavailable, { readonly brand: unique symbol }>(
  "@vidbee/downloader-core/ProfileUnavailable"
)("ProfileUnavailable", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class ProfileBusy extends S.TaggedError<ProfileBusy, { readonly brand: unique symbol }>(
  "@vidbee/downloader-core/ProfileBusy"
)("ProfileBusy", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class ProfileIdentityMismatch extends S.TaggedError<ProfileIdentityMismatch, { readonly brand: unique symbol }>(
  "@vidbee/downloader-core/ProfileIdentityMismatch"
)("ProfileIdentityMismatch", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class BoundaryDecodeError extends S.TaggedError<BoundaryDecodeError, { readonly brand: unique symbol }>(
  "@vidbee/downloader-core/BoundaryDecodeError"
)("BoundaryDecodeError", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export class HostFailure extends S.TaggedError<HostFailure, { readonly brand: unique symbol }>(
  "@vidbee/downloader-core/HostFailure"
)("HostFailure", { operation: S.String, legacyMessage: S.String, cause: S.optional(S.Defect()) }) {}
export type DownloaderError =
  | InvalidDownload
  | BinaryUnavailable
  | MetadataFailure
  | ProfileUnavailable
  | ProfileBusy
  | ProfileIdentityMismatch
  | BoundaryDecodeError
  | HostFailure;
