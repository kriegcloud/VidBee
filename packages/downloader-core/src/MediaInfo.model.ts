import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
export const PlaylistMediaKind = LiteralKit(["photo", "video", "recording"]);
export type PlaylistMediaKind = typeof PlaylistMediaKind.Type;
export const VideoFormat = S.Struct({
  formatId: S.String.pipe(S.mutableKey),
  ext: S.String.pipe(S.mutableKey),
  width: S.Finite.pipe(S.optional, S.mutableKey),
  height: S.Finite.pipe(S.optional, S.mutableKey),
  fps: S.Finite.pipe(S.optional, S.mutableKey),
  vcodec: S.String.pipe(S.optional, S.mutableKey),
  acodec: S.String.pipe(S.optional, S.mutableKey),
  filesize: S.Finite.pipe(S.optional, S.mutableKey),
  filesizeApprox: S.Finite.pipe(S.optional, S.mutableKey),
  formatNote: S.String.pipe(S.optional, S.mutableKey),
  tbr: S.Finite.pipe(S.optional, S.mutableKey),
  quality: S.Finite.pipe(S.optional, S.mutableKey),
  protocol: S.String.pipe(S.optional, S.mutableKey),
  language: S.String.pipe(S.optional, S.mutableKey),
  videoExt: S.String.pipe(S.optional, S.mutableKey),
  audioExt: S.String.pipe(S.optional, S.mutableKey),
});
export type VideoFormat = typeof VideoFormat.Type;
export const VideoInfo = S.Struct({
  id: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  thumbnail: S.String.pipe(S.optional, S.mutableKey),
  duration: S.Finite.pipe(S.optional, S.mutableKey),
  extractorKey: S.String.pipe(S.optional, S.mutableKey),
  webpageUrl: S.String.pipe(S.optional, S.mutableKey),
  description: S.String.pipe(S.optional, S.mutableKey),
  viewCount: S.Finite.pipe(S.optional, S.mutableKey),
  uploader: S.String.pipe(S.optional, S.mutableKey),
  tags: S.Array(S.String).pipe(S.mutable, S.optional, S.mutableKey),
  formats: S.Array(VideoFormat).pipe(S.mutable, S.mutableKey),
});
export type VideoInfo = typeof VideoInfo.Type;
export const PlaylistEntry = S.Struct({
  id: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  url: S.String.pipe(S.mutableKey),
  index: S.Finite.pipe(S.mutableKey),
  thumbnail: S.String.pipe(S.optional, S.mutableKey),
  mediaKind: PlaylistMediaKind.pipe(S.optional, S.mutableKey),
});
export type PlaylistEntry = typeof PlaylistEntry.Type;
export const PlaylistInfo = S.Struct({
  id: S.String.pipe(S.mutableKey),
  title: S.String.pipe(S.mutableKey),
  entries: S.Array(PlaylistEntry).pipe(S.mutable, S.mutableKey),
  entryCount: S.Finite.pipe(S.mutableKey),
});
export type PlaylistInfo = typeof PlaylistInfo.Type;
