import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { AsrTierId, ModelGroup, ModelRole } from "./Literal.model.js";
import type { ModelFileSpec, ModelStatus } from "./Model.model.js";
import type { EnsureReadyOptions } from "./ModelFiles.model.js";
import type { HostFailure, TranscriptionError } from "./Transcription.errors.js";
export interface ModelStatusSink {
  readonly emit: (status: ModelStatus) => Effect.Effect<void, HostFailure>;
}
/** Manager-local host callback seams; native composition supplies its controller factory explicitly. */
export class ModelsHooks extends Context.Service<
  ModelsHooks,
  {
    readonly makeAbortController: () => AbortController;
    readonly preferChina: Effect.Effect<boolean, HostFailure>;
    readonly resolveUrls?: ((spec: ModelFileSpec) => Effect.Effect<readonly string[], HostFailure>) | undefined;
    readonly afterArchiveStaged?: ((staging: string) => Effect.Effect<void, HostFailure>) | undefined;
  }
>()("@vidbee/transcription/Models.service/ModelsHooks") {}
export class Models extends Context.Service<
  Models,
  {
    readonly modelsDir: string;
    readonly status: (
      groups?: readonly ModelGroup[],
      tiers?: readonly AsrTierId[]
    ) => Effect.Effect<ModelStatus, TranscriptionError>;
    readonly pathFor: (spec: Pick<ModelFileSpec, "fileName">) => Effect.Effect<string, HostFailure>;
    readonly pathByRole: (role: ModelRole, tier?: AsrTierId) => Effect.Effect<string | null, TranscriptionError>;
    readonly pathById: (id: string) => Effect.Effect<string | null, TranscriptionError>;
    readonly incompleteModelIssue: (tier?: AsrTierId) => Effect.Effect<string | null, TranscriptionError>;
    readonly ensureReady: (options?: EnsureReadyOptions) => Effect.Effect<ModelStatus, TranscriptionError>;
    readonly ensureReadyAllowCancel: (options?: EnsureReadyOptions) => Effect.Effect<ModelStatus, TranscriptionError>;
    readonly redownload: Effect.Effect<ModelStatus, TranscriptionError>;
    readonly removeTier: (tier: AsrTierId) => Effect.Effect<ModelStatus, TranscriptionError>;
    readonly cancelDownload: (tier: AsrTierId) => Effect.Effect<ModelStatus, TranscriptionError>;
    readonly subscribe: (sink: ModelStatusSink) => Effect.Effect<Effect.Effect<void>, HostFailure>;
  }
>()("@vidbee/transcription/Models.service/Models") {}
