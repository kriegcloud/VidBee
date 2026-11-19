import * as S from "effect/Schema";
import { Envelope } from "./Envelope.model.js";
import type { AddTaskRequest } from "@vidbee/task-queue/TaskQueue.model";
import type * as Effect from "effect/Effect";
import type { HandshakeWire } from "./Automation.model.js";
import type { AutomationHttpError, CliFailure } from "./Cli.errors.js";
import type { ListInput } from "./Parser.model.js";
export const RunResult = S.Struct({ exitCode: S.Finite.pipe(S.mutableKey), envelope: Envelope.pipe(S.mutableKey) });
export type RunResult = typeof RunResult.Type;
export type CliError = AutomationHttpError | CliFailure;
export interface EffectContractClient<Id = unknown, TaskValue = unknown> {
  readonly add?: (request: AddTaskRequest) => Effect.Effect<{ id: Id; task: TaskValue }, CliError>;
  readonly cancel?: (id: Id) => Effect.Effect<void, CliError>;
  readonly get: (id: Id) => Effect.Effect<TaskValue, CliError>;
  readonly list: (
    input: ListInput
  ) => Effect.Effect<{ items: ReadonlyArray<TaskValue>; nextCursor: unknown }, CliError>;
  readonly pause?: (id: Id, reason?: string) => Effect.Effect<void, CliError>;
  readonly removeFromHistory: (id: Id) => Effect.Effect<void, CliError>;
  readonly resume?: (id: Id) => Effect.Effect<void, CliError>;
  readonly retry?: (id: Id) => Effect.Effect<void, CliError>;
  readonly stats: Effect.Effect<unknown, CliError>;
}
export interface AutomationSession extends EffectContractClient {
  readonly ensureToken: Effect.Effect<string, CliError>;
  readonly handshake: Effect.Effect<HandshakeWire, CliError>;
}
