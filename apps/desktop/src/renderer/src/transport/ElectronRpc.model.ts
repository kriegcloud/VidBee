import * as S from "effect/Schema";
import { Counter } from "./DocumentDelivery.model.js";

export const RequestId = S.Union([S.String, S.Finite]);
export type RequestId = typeof RequestId.Type;
const Request = S.TaggedStruct("Request", {
  id: RequestId,
  tag: S.String,
  payload: S.Unknown,
  headers: S.Array(S.Tuple([S.String, S.String]).pipe(S.mutable)),
  isNotification: S.optionalKey(S.Literal(true)),
  discard: S.optionalKey(S.Literal(true)),
  traceId: S.optionalKey(S.String),
  spanId: S.optionalKey(S.String),
  sampled: S.optionalKey(S.Boolean),
});
export const FromClient = S.Union([
  Request,
  S.TaggedStruct("Ack", { requestId: RequestId }),
  S.TaggedStruct("Interrupt", { requestId: RequestId }),
  S.TaggedStruct("Ping", {}),
  S.TaggedStruct("Eof", {}),
]);
export type FromClient = typeof FromClient.Type;
const EncodedExit = S.Union([
  S.TaggedStruct("Success", { value: S.Unknown }),
  S.TaggedStruct("Failure", {
    cause: S.Array(
      S.Union([
        S.TaggedStruct("Fail", { error: S.Unknown }),
        S.TaggedStruct("Die", { defect: S.Unknown }),
        S.TaggedStruct("Interrupt", { fiberId: S.NullishOr(S.Finite) }),
      ])
    ),
  }),
]);
export const ResponseExit = S.TaggedStruct("Exit", { requestId: RequestId, exit: EncodedExit });
export type ResponseExit = typeof ResponseExit.Type;
export const FromServer = S.Union([
  ResponseExit,
  S.TaggedStruct("Chunk", { requestId: RequestId, values: S.NonEmptyArray(S.Unknown) }),
  S.TaggedStruct("Defect", { defect: S.Unknown }),
  S.TaggedStruct("Pong", {}),
]);
export type FromServer = typeof FromServer.Type;
export const Input = S.Struct({ session: S.String, client: Counter, message: FromClient });
export type Input = typeof Input.Type;
export const Output = S.Struct({
  session: S.String,
  client: Counter,
  message: S.Union([FromServer, S.TaggedStruct("Terminal", { response: ResponseExit })]),
});
export type Output = typeof Output.Type;
export const Connect = S.Struct({ session: S.String, generation: Counter, version: S.Literal(1) });
export type Connect = typeof Connect.Type;
export const channels = {
  connect: "vidbee:rpc:connect:v1",
  message: "vidbee:rpc:message:v1",
  end: "vidbee:rpc:end:v1",
};
/** Narrow, browser-safe preload surface. Registration must precede connect. */
export interface DesktopRpcBridge {
  readonly connect: () => Promise<unknown>;
  readonly disconnect: (session: string) => void;
  readonly send: (frame: string) => void;
  readonly subscribe: (receive: (frame: unknown) => void) => () => void;
}
