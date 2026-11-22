import * as Pipeline from "@vidbee/transcription/Pipeline.model";
import * as S from "effect/Schema";
export const CloudAccepted = S.StructWithRest(
  S.Struct({ requestId: S.String, modelId: S.String, text: S.String, credits: S.Finite }),
  [S.Record(S.String, S.Unknown)]
);
export type CloudAccepted = typeof CloudAccepted.Type;
export const CloudObservedPipeline = S.Struct({ ...Pipeline.PipelineResult.fields, language: S.Unknown });
export type CloudObservedPipeline = typeof CloudObservedPipeline.Type;
