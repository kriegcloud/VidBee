import * as S from "effect/Schema";
export const MergeTaskQueueDbResult = S.Struct({
  merged: S.mutableKey(S.Boolean),
  tasksCopied: S.mutableKey(S.Finite),
  attemptsCopied: S.mutableKey(S.Finite),
  journalCopied: S.mutableKey(S.Finite),
  backupPath: S.String.pipe(S.NullOr, S.mutableKey),
});
export type MergeTaskQueueDbResult = typeof MergeTaskQueueDbResult.Type;
export const MigrationCount = S.Struct({ n: S.Union([S.Finite, S.BigInt]) });
export const MigrationTable = S.Struct({ name: S.optional(S.String) });

export const MergeTaskQueueDbInput = S.Struct({ legacyPath: S.String });
export type MergeTaskQueueDbInput = typeof MergeTaskQueueDbInput.Type;
