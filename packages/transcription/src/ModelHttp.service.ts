import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ModelRequest } from "./ModelHttp.model.js";
import type { HostFailure } from "./Transcription.errors.js";
export interface ModelResponse {
  readonly consume: (sink: (chunk: Uint8Array) => Effect.Effect<void, HostFailure>) => Effect.Effect<void, HostFailure>;
  readonly contentLength: string | null;
  readonly hasBody: boolean;
  readonly ok: boolean;
  readonly originalResponse?: Response;
  readonly status: number;
}
export class ModelHttp extends Context.Service<
  ModelHttp,
  {
    readonly request: (spec: ModelRequest) => Effect.Effect<ModelResponse, HostFailure>;
  }
>()("@vidbee/transcription/ModelHttp.service/ModelHttp") {}
