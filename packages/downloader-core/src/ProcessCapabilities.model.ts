import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as S from "effect/Schema";
import { ProcessSpec } from "./Process.model.js";

/** Output consumption is independent of the descriptor disposition. */
export const ProcessOutputConsumption = LiteralKit(["events", "leaveUnread"]);
export type ProcessOutputConsumption = typeof ProcessOutputConsumption.Type;
export const ProcessCapabilitiesSpec = S.Struct({
  ...ProcessSpec.fields,
  stdoutConsumption: ProcessOutputConsumption,
  stderrConsumption: ProcessOutputConsumption,
});
export type ProcessCapabilitiesSpec = typeof ProcessCapabilitiesSpec.Type;
export const LiveSignallingState = S.Union([
  S.TaggedStruct("Raw", { killed: S.Boolean }),
  S.TaggedStruct("Native", {}),
]);
export type LiveSignallingState = typeof LiveSignallingState.Type;
