import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { DirectoryAssessment, DirectoryMemberRequirement, ModelFileSpec } from "./Model.model.js";
import type { ModelResponse } from "./ModelHttp.service.js";
import type { HostFailure, TranscriptionError } from "./Transcription.errors.js";

export class ModelFileIO extends Context.Service<
  ModelFileIO,
  {
    readonly readManifest: (path: string) => Effect.Effect<Uint8Array, HostFailure>;
    readonly parseJson: (text: string) => Effect.Effect<unknown, HostFailure>;
    readonly digest: (bytes: Uint8Array) => Effect.Effect<string, HostFailure>;
    readonly stream: (
      response: ModelResponse,
      path: string,
      signal: AbortSignal | undefined,
      verify: boolean,
      chunk: (bytes: Uint8Array) => Effect.Effect<void, HostFailure>
    ) => Effect.Effect<string | undefined, HostFailure>;
    readonly extract: (
      archive: string,
      staging: string,
      signal: AbortSignal | undefined
    ) => Effect.Effect<void, TranscriptionError>;
  }
>()("@vidbee/transcription/ModelFiles.service/ModelFileIO") {}
export class ModelFiles extends Context.Service<
  ModelFiles,
  {
    readonly assess: (
      spec: Pick<ModelFileSpec, "directoryMembers" | "role">,
      path: string
    ) => Effect.Effect<DirectoryAssessment, HostFailure>;
    readonly assessDirectory: (
      dir: string,
      members: readonly DirectoryMemberRequirement[],
      withRepairHint: boolean
    ) => Effect.Effect<DirectoryAssessment, HostFailure>;
    readonly presentBytes: (path: string) => Effect.Effect<{ present: boolean; bytes: number }, HostFailure>;
    readonly partPath: (destination: string) => Effect.Effect<string, HostFailure>;
    readonly removePartFiles: (destination: string) => Effect.Effect<void, HostFailure>;
    readonly publishFile: (temporary: string, destination: string) => Effect.Effect<void, HostFailure>;
    readonly acquireArchiveLock: (directory: string) => Effect.Effect<void, TranscriptionError>;
    readonly releaseArchiveLock: (directory: string) => Effect.Effect<void, HostFailure>;
    readonly stagingPath: (archive: string) => Effect.Effect<string, HostFailure>;
    readonly removeStaleStaging: (archive: string) => Effect.Effect<void, HostFailure>;
    readonly liveStaging: (archive: string) => Effect.Effect<string[], HostFailure>;
  }
>()("@vidbee/transcription/ModelFiles.service/ModelFiles") {}
