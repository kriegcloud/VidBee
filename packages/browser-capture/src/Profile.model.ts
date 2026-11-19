import * as OnlyFans from "@vidbee/downloader-core/onlyfans-profile";
import * as S from "effect/Schema";

export const ChatVideoAttachment = S.Struct({
  id: S.String.pipe(S.mutableKey),
  postId: S.String.pipe(S.mutableKey),
  state: OnlyFans.OnlyFansItemSchema.fields.state.pipe(S.mutableKey),
  durationSec: S.NullOr(S.Finite).pipe(S.mutableKey),
  previewPath: S.NullOr(S.String).pipe(S.mutableKey),
});
export type ChatVideoAttachment = typeof ChatVideoAttachment.Type;
export const MediaReference = S.Struct({
  item: OnlyFans.OnlyFansItemSchema.pipe(S.mutableKey),
  mediaUrl: S.NullOr(S.String).pipe(S.mutableKey),
});
export type MediaReference = typeof MediaReference.Type;
export const EnqueueResult = S.Struct({ count: S.Finite });
export const DownloadResult = S.Struct({ filePath: S.String, size: S.Finite });
// Transfer progress is a typed in-process calculation; this model is not a decoder
// for derived totals (which intentionally retain infinities and signed zero).
export const TransferProgress = S.Struct({ bytes: S.Finite, total: S.Finite });
export type TransferProgress = typeof TransferProgress.Type;
