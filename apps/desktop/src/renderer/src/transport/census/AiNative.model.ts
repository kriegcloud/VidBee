import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";
import { RpcOptional } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";

const $TransportId = $DesktopId.create("renderer/src/transport/census/AiNative.model");

/**
 * Selects the conversation and message, run and artifact IDs included in an AI persistence operation.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { SaveScope } from "./AiNative.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(SaveScope)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const SaveScope = S.Struct({
  thread: RpcOptional(S.Boolean),
  messageIds: S.String.pipe(S.Array, RpcOptional),
  runIds: S.String.pipe(S.Array, RpcOptional),
  artifactIds: S.String.pipe(S.Array, RpcOptional),
}).pipe(
  $TransportId.annoteSchema("SaveScope", { description: "Save Scope boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link SaveScope}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SaveScope = typeof SaveScope.Type;
/**
 * Preserves an AI native entry with its tagged observation representation for replay.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Entry } from "./AiNative.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Entry)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Entry = RpcObserved(S.Record(S.String, S.Unknown)).pipe(
  $TransportId.annoteSchema("Entry", { description: "Entry boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Entry}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Entry = typeof Entry.Type;
/**
 * Preserves a native agent event and its optional message, entry and data payloads.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { PiEvent } from "./AiNative.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(PiEvent)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const PiEvent = RpcObserved(
  S.Struct({
    type: S.String,
    message: S.optionalKey(S.Unknown),
    entry: S.optionalKey(Entry),
    data: S.optionalKey(S.Unknown),
  })
).pipe($TransportId.annoteSchema("PiEvent", { description: "Pi Event boundary in the desktop transport contract." }));
/**
 * Decoded representation validated by {@link PiEvent}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PiEvent = typeof PiEvent.Type;
/**
 * Preserves a native tool definition, including the parameter schema supplied by the agent runtime.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { ToolDefinition } from "./AiNative.model.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(ToolDefinition)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ToolDefinition = RpcObserved(
  S.Struct({ name: S.String, label: S.String, description: S.String, parameters: S.Unknown })
).pipe(
  $TransportId.annoteSchema("ToolDefinition", {
    description: "Tool Definition boundary in the desktop transport contract.",
  })
);
/**
 * Decoded representation validated by {@link ToolDefinition}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ToolDefinition = typeof ToolDefinition.Type;
