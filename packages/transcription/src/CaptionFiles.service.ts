import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CaptionTrack } from "./Caption.model.js";
import type { HostFailure } from "./Transcription.errors.js";
export type CaptionCandidate = Pick<CaptionTrack, "language" | "path" | "text" | "title">;
export class CaptionFiles extends Context.Service<
  CaptionFiles,
  {
    readonly findSidecar: (sourceFilePath: string) => Effect.Effect<CaptionTrack[], HostFailure>;
    readonly isMachinePath: (path: string | null | undefined) => Effect.Effect<boolean, HostFailure>;
    readonly languageFromName: (fileName: string, mediaStem: string) => Effect.Effect<string | null, HostFailure>;
    readonly importable: (track: {
      language?: string | null | undefined;
      path?: string | undefined;
      title?: string | undefined;
    }) => Effect.Effect<boolean, HostFailure>;
    readonly pick: <T extends CaptionCandidate>(
      tracks: T[],
      preferred: string[]
    ) => Effect.Effect<T | null, HostFailure>;
  }
>()("@vidbee/transcription/CaptionFiles.service/CaptionFiles") {}
