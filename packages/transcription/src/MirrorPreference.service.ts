import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { MirrorDecisionInput } from "./Mirror.model.js";
import type { HostFailure } from "./Transcription.errors.js";
export class MirrorPreference extends Context.Service<
  MirrorPreference,
  {
    readonly preferChina: (input?: MirrorDecisionInput) => Effect.Effect<boolean, HostFailure>;
  }
>()("@vidbee/transcription/MirrorPreference.service/MirrorPreference") {}
