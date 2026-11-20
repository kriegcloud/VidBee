import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { PipelineSeed } from "./Seed.model.js";
import type { StoredTranscriptRecord } from "./Transcript.model.js";
import type { HostFailure } from "./Transcription.errors.js";
import type { StoreError } from "./TranscriptStore.service.js";
export type SeedStoreError = StoreError | HostFailure;
export class SeedStore extends Context.Service<
  SeedStore,
  {
    readonly latest: (downloadTaskId: string) => Effect.Effect<StoredTranscriptRecord | null, SeedStoreError>;
    readonly list: (downloadTaskId: string) => Effect.Effect<StoredTranscriptRecord[], SeedStoreError>;
  }
>()("@vidbee/transcription/Seeds.service/SeedStore") {}
export class Seeds extends Context.Service<
  Seeds,
  {
    readonly latestAsr: (downloadTaskId: string) => Effect.Effect<PipelineSeed | null, SeedStoreError>;
    readonly latestTranscript: (downloadTaskId: string) => Effect.Effect<PipelineSeed | null, SeedStoreError>;
  }
>()("@vidbee/transcription/Seeds.service/Seeds") {}
