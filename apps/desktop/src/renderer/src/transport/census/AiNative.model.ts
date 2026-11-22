import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";
import { RpcOptional } from "../RpcField.model.js";
import { RpcObserved } from "../RpcObservation.model.js";

const $TransportId = $DesktopId.create("renderer/src/transport/census/AiNative.model");

/**
 * Validates Save Scope at the desktop capability boundary before dispatch.
 *
 * **Example** (Use SaveScope at its owning boundary)
 *
 * ```ts
 * import { SaveScope } from "./AiNative.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(SaveScope);
 * const validated = decode({});
 * void validated;
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
 * Describes Save Scope ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type SaveScope = typeof SaveScope.Type;
/**
 * Validates Entry at the desktop capability boundary before dispatch.
 *
 * **Example** (Use Entry at its owning boundary)
 *
 * ```ts
 * import { Entry } from "./AiNative.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Entry);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Entry = RpcObserved(S.Record(S.String, S.Unknown)).pipe(
  $TransportId.annoteSchema("Entry", { description: "Entry boundary in the desktop transport contract." })
);
/**
 * Describes Entry ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Entry = typeof Entry.Type;
/**
 * Validates Pi Event at the desktop capability boundary before dispatch.
 *
 * **Example** (Use PiEvent at its owning boundary)
 *
 * ```ts
 * import { PiEvent } from "./AiNative.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(PiEvent);
 * const validated = decode({});
 * void validated;
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
 * Describes Pi Event ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type PiEvent = typeof PiEvent.Type;
/**
 * Validates Tool Definition at the desktop capability boundary before dispatch.
 *
 * **Example** (Use ToolDefinition at its owning boundary)
 *
 * ```ts
 * import { ToolDefinition } from "./AiNative.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ToolDefinition);
 * const validated = decode({});
 * void validated;
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
 * Describes Tool Definition ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ToolDefinition = typeof ToolDefinition.Type;
