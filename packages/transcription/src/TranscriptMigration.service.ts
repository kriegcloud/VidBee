import * as Context from "effect/Context";
import type { DbRowDecodeError } from "@vidbee/db";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { SqlError } from "effect/sql/SqlError";
import type { HostFailure } from "./Transcription.errors.js";
import type { MergeTaskQueueDbInput, MergeTaskQueueDbResult } from "./TranscriptMigration.model.js";
export interface MigrationSource {
  readonly close: Effect.Effect<void, HostFailure>;
  readonly hasTasks: Effect.Effect<boolean, HostFailure | DbRowDecodeError>;
}
export class TranscriptMigrationSource extends Context.Service<
  TranscriptMigrationSource,
  {
    readonly open: (path: string) => Effect.Effect<MigrationSource, HostFailure, Scope.Scope>;
  }
>()("@vidbee/transcription/TranscriptMigration.service/TranscriptMigrationSource") {}
export class TranscriptMigration extends Context.Service<
  TranscriptMigration,
  {
    readonly merge: (
      input: MergeTaskQueueDbInput
    ) => Effect.Effect<MergeTaskQueueDbResult, SqlError | DbRowDecodeError | HostFailure>;
  }
>()("@vidbee/transcription/TranscriptMigration.service/TranscriptMigration") {}
