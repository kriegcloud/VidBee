import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { HostFailure } from "./Transcription.errors.js";
import type { TranscriptionFileStat } from "./TranscriptionFiles.model.js";
export interface TranscriptionReadHandle {
  readonly close: Effect.Effect<void, HostFailure>;
  readonly readAt: (
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number
  ) => Effect.Effect<number, HostFailure>;
}
export class TranscriptionFiles extends Context.Service<
  TranscriptionFiles,
  {
    readonly readBytes: (path: string) => Effect.Effect<Uint8Array, HostFailure>;
    readonly readText: (path: string) => Effect.Effect<string, HostFailure>;
    readonly stat: (path: string) => Effect.Effect<TranscriptionFileStat, HostFailure>;
    readonly readDirectory: (path: string) => Effect.Effect<string[], HostFailure>;
    readonly exists: (path: string) => Effect.Effect<boolean>;
    readonly write: (path: string, data: Uint8Array | string) => Effect.Effect<void, HostFailure>;
    readonly mkdir: (path: string, recursive: boolean) => Effect.Effect<void, HostFailure>;
    readonly rename: (source: string, target: string) => Effect.Effect<void, HostFailure>;
    readonly remove: (path: string, recursive: boolean, force: boolean) => Effect.Effect<void, HostFailure>;
    readonly openRead: (path: string) => Effect.Effect<TranscriptionReadHandle, HostFailure, Scope.Scope>;
  }
>()("@vidbee/transcription/TranscriptionFiles.service/TranscriptionFiles") {}
