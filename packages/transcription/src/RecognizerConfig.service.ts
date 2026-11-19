import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { AsrModelPaths } from "./Asr.model.js";
import type { AsrTierId, ModelRole } from "./Literal.model.js";
import type { RecognizerConfigInput } from "./RecognizerConfig.model.js";
import type { TranscriptionError } from "./Transcription.errors.js";
export class RecognizerModels extends Context.Service<
  RecognizerModels,
  {
    readonly incompleteModelIssue: (tier: AsrTierId) => Effect.Effect<string | null, TranscriptionError>;
    readonly pathByRole: (role: ModelRole, tier: AsrTierId) => Effect.Effect<string | null, TranscriptionError>;
  }
>()("@vidbee/transcription/RecognizerConfig.service/RecognizerModels") {}
export class RecognizerConfig extends Context.Service<
  RecognizerConfig,
  {
    readonly paths: (tier: AsrTierId) => Effect.Effect<AsrModelPaths, TranscriptionError>;
    readonly tryConfig: (input: RecognizerConfigInput) => Effect.Effect<Record<string, unknown> | null, never>;
  }
>()("@vidbee/transcription/RecognizerConfig.service/RecognizerConfig") {}
