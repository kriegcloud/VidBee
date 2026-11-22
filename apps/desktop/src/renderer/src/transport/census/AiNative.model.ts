import * as S from "effect/Schema";
import { RpcOptional } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";
export const SaveScope = S.Struct({
  thread: RpcOptional(S.Boolean),
  messageIds: S.String.pipe(S.Array, RpcOptional),
  runIds: S.String.pipe(S.Array, RpcOptional),
  artifactIds: S.String.pipe(S.Array, RpcOptional),
});
export const Entry = RpcObserved(S.Record(S.String, S.Unknown));
export const PiEvent = RpcObserved(
  S.Struct({
    type: S.String,
    message: S.optionalKey(S.Unknown),
    entry: S.optionalKey(Entry),
    data: S.optionalKey(S.Unknown),
  })
);
export const ToolDefinition = RpcObserved(
  S.Struct({ name: S.String, label: S.String, description: S.String, parameters: S.Unknown })
);
