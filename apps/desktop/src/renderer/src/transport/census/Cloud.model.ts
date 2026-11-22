import { $DesktopId } from "@vidbee/identity/packages";
import * as Pipeline from "@vidbee/transcription/Pipeline.model";
import * as S from "effect/Schema";

const $TransportId = $DesktopId.create("renderer/src/transport/census/Cloud.model");

/**
 * Validates Cloud Accepted at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CloudAccepted at its owning boundary)
 *
 * ```ts
 * import { CloudAccepted } from "./Cloud.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CloudAccepted);
 * const validated = decode({});
 * void validated;
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
 * Describes Cloud Accepted ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudAccepted = typeof CloudAccepted.Type;
/**
 * Validates Cloud Observed Pipeline at the desktop capability boundary before dispatch.
 *
 * **Example** (Use CloudObservedPipeline at its owning boundary)
 *
 * ```ts
 * import { CloudObservedPipeline } from "./Cloud.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(CloudObservedPipeline);
 * const validated = decode({});
 * void validated;
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
 * Describes Cloud Observed Pipeline ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type CloudObservedPipeline = typeof CloudObservedPipeline.Type;
