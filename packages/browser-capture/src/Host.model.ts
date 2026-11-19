import * as S from "effect/Schema";
export const HostSnapshot = S.Struct({
  platform: S.String,
  home: S.String,
  temp: S.String,
  execPath: S.String,
  pid: S.Finite,
  environment: S.Record(S.String, S.UndefinedOr(S.String)),
});
export type HostSnapshot = typeof HostSnapshot.Type;
export const CaptureFileInfo = S.Struct({ size: S.Finite, isFile: S.Boolean, isDirectory: S.Boolean });
export type CaptureFileInfo = typeof CaptureFileInfo.Type;

export const FileOptions = S.Struct({ sync: S.optional(S.Boolean) });
export type FileOptions = typeof FileOptions.Type;
export const WriteOptions = S.Struct({ ...FileOptions.fields, mode: S.optional(S.Finite) });
export type WriteOptions = typeof WriteOptions.Type;
export const DirectoryOptions = S.Struct({ ...WriteOptions.fields, recursive: S.optional(S.Boolean) });
export type DirectoryOptions = typeof DirectoryOptions.Type;
export const RemoveOptions = S.Struct({
  ...FileOptions.fields,
  recursive: S.optional(S.Boolean),
  force: S.optional(S.Boolean),
});
export type RemoveOptions = typeof RemoveOptions.Type;
