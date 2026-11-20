import * as Context from "effect/Context";
import type { Task } from "@vidbee/task-queue/Task.model";
import type * as Effect from "effect/Effect";
import type { ImportCaptionsRequest } from "./Coordinator.model.js";
import type { EnqueueTranscriptionInput } from "./Enqueue.model.js";
import type { EnqueueError } from "./Enqueue.service.js";
import type { HostFailure } from "./Transcription.errors.js";
export class CoordinatorHooks extends Context.Service<
  CoordinatorHooks,
  {
    readonly source: (task: Readonly<Task>) => Effect.Effect<string | null, HostFailure>;
    readonly enabled: Effect.Effect<boolean, HostFailure>;
    readonly modelsReady?: Effect.Effect<boolean, HostFailure>;
    readonly importCaptions?: (input: ImportCaptionsRequest) => Effect.Effect<boolean, HostFailure>;
    readonly enqueueInput: (
      task: Readonly<Task>,
      source: string
    ) => Effect.Effect<EnqueueTranscriptionInput, HostFailure>;
    readonly warn: (message: string, error: EnqueueError) => Effect.Effect<void, HostFailure>;
  }
>()("@vidbee/transcription/Coordinator.service/CoordinatorHooks") {}
export class Coordinator extends Context.Service<
  Coordinator,
  {
    readonly start: Effect.Effect<void, EnqueueError>;
    readonly stop: Effect.Effect<void>;
    readonly flushPending: Effect.Effect<void, EnqueueError>;
  }
>()("@vidbee/transcription/Coordinator.service/Coordinator") {}
