import { $DesktopId } from "@vidbee/identity/packages";
import * as Pipeline from "@vidbee/transcription/Pipeline.model";
import * as S from "effect/Schema";

const $TransportId = $DesktopId.create("renderer/src/transport/census/Cloud.model");

/**
 * Validates accepted cloud work by request ID, model ID, text and charged credits while retaining additional response fields.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CloudAccepted } from "./Cloud.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CloudAccepted)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CloudAccepted = S.StructWithRest(
  S.Struct({ requestId: S.String, modelId: S.String, text: S.String, credits: S.Finite }),
  [S.Record(S.String, S.Unknown)]
).pipe(
  $TransportId.annoteSchema("CloudAccepted", {
    description: "Cloud Accepted boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link CloudAccepted}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudAccepted = typeof CloudAccepted.Type;
/**
 * Projects the transcription pipeline result and observed language without narrowing away the native language observation.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { CloudObservedPipeline } from "./Cloud.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(CloudObservedPipeline)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const CloudObservedPipeline = S.Struct({ ...Pipeline.PipelineResult.fields, language: S.Unknown }).pipe(
  $TransportId.annoteSchema("CloudObservedPipeline", {
    description: "Cloud Observed Pipeline boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link CloudObservedPipeline}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudObservedPipeline = typeof CloudObservedPipeline.Type;
