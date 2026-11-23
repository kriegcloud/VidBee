import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";
import { DesktopLogEntry } from "./DesktopLog.model.js";

const $I = $DesktopId.create("shared/logging/DesktopLogWire.model");

/** IPC limits for one diagnostic line, independent of trusted native logging.
 * 64 arguments bound native spread; 1024 array cells retain small snapshots, with
 * 4096 cells total. 256 graph nodes / 2048 fields allow rich Cause context.
 * 16 Ki UTF-16 units per string retain stacks; a conservative 256 KiB total
 * charge includes four bytes per code unit plus object/field/slot overhead.
 * Depth 32 bounds downstream traversal. 16384 inspected values also bound
 * validation of wire metadata and shared-reference paths before reconstruction.
 * A 4096-bit bigint cap bounds binary payloads without first stringifying them.
 * **Example** (Check the argument allowance)
 * ```ts
 * import { DesktopLogBudgets } from "./DesktopLogWire.model.js"
 * console.assert(DesktopLogBudgets.maxArguments === 64)
 * ```
 * @category configuration
 * @since 0.0.0
 */
export const DesktopLogBudgets = {
  maxArguments: 64,
  maxArrayLength: 1024,
  maxArraySlots: 4096,
  maxNodes: 256,
  maxFields: 2048,
  maxStringLength: 16384,
  maxPayloadBytes: 262144,
  maxDepth: 32,
  maxInspectedValues: 16384,
  maxBigIntBits: 4096,
} as const;

/** Bounded admission and reconstruction work, observable without logging payloads.
 * **Example** (Observe a rejected packet's allocation count)
 * ```ts
 * import { DesktopLogWireWork } from "./DesktopLogWire.model.js"
 * console.assert(DesktopLogWireWork.make({ inspected: 1, allocatedNodes: 0, allocatedSlots: 0 }).allocatedNodes === 0)
 * ```
 * @category models
 * @since 0.0.0
 */
export class DesktopLogWireWork extends S.Opaque<DesktopLogWireWork, { readonly brand: unique symbol }>()(
  S.Struct({ inspected: S.Int, allocatedNodes: S.Int, allocatedSlots: S.Int }).pipe(
    $I.annoteSchema("DesktopLogWireWork", {
      description: "Content-free work counters for IPC admission and reconstruction.",
    })
  )
) {}

/** A graph edge or an opaque value supported by Electron structured cloning.
 * **Example** (Reference the first node)
 * ```ts
 * import { DesktopWireValue } from "./DesktopLogWire.model.js"
 * console.assert(DesktopWireValue.cases.Reference.make({ index: 0 }).index === 0)
 * ```
 * @category models
 * @since 0.0.0
 */
export const DesktopWireValue = S.TaggedUnion({
  Reference: { index: S.Int.check(S.isGreaterThanOrEqualTo(0)) },
  Value: { value: S.Unknown },
}).pipe($I.annoteSchema("DesktopWireValue", { description: "Unambiguous graph reference or native cloneable value." }));
/** Validated graph value type.
 * **Example** (Construct a primitive)
 * ```ts
 * import { DesktopWireValue } from "./DesktopLogWire.model.js"
 * const value: DesktopWireValue = DesktopWireValue.cases.Value.make({ value: 42n })
 * console.assert(value._tag === "Value" && value.value === 42n)
 * ```
 * @category models
 * @since 0.0.0
 */
export type DesktopWireValue = typeof DesktopWireValue.Type;

/** Graph nodes retain cycles, array holes and native Error properties.
 * **Example** (Represent an empty array)
 * ```ts
 * import { DesktopWireNode } from "./DesktopLogWire.model.js"
 * console.assert(DesktopWireNode.cases.Array.make({ length: 0, fields: [] }).length === 0)
 * ```
 * @category models
 * @since 0.0.0
 */
export const DesktopWireNode = S.TaggedUnion({
  Record: {
    fields: S.Array(
      S.Tuple([S.String.check(S.isMaxLength(DesktopLogBudgets.maxStringLength)), S.Boolean, DesktopWireValue])
    ).check(S.isMaxLength(DesktopLogBudgets.maxFields)),
  },
  Array: {
    length: S.Int.check(S.isGreaterThanOrEqualTo(0), S.isLessThanOrEqualTo(DesktopLogBudgets.maxArrayLength)),
    fields: S.Array(
      S.Tuple([S.String.check(S.isMaxLength(DesktopLogBudgets.maxStringLength)), S.Boolean, DesktopWireValue])
    ).check(S.isMaxLength(DesktopLogBudgets.maxFields)),
  },
  Error: {
    name: S.String.check(S.isMaxLength(DesktopLogBudgets.maxStringLength)),
    message: S.String.check(S.isMaxLength(DesktopLogBudgets.maxStringLength)),
    stack: S.UndefinedOr(S.String.check(S.isMaxLength(DesktopLogBudgets.maxStringLength))),
    fields: S.Array(
      S.Tuple([S.String.check(S.isMaxLength(DesktopLogBudgets.maxStringLength)), S.Boolean, DesktopWireValue])
    ).check(S.isMaxLength(DesktopLogBudgets.maxFields)),
  },
}).pipe(
  $I.annoteSchema("DesktopWireNode", {
    description: "Node properties are edges, so cycles and nested Error causes survive contextBridge.",
  })
);
/** Validated graph node type.
 * **Example** (Construct an object node)
 * ```ts
 * import { DesktopWireNode } from "./DesktopLogWire.model.js"
 * const node: DesktopWireNode = DesktopWireNode.cases.Record.make({ fields: [] })
 * console.assert(node.fields.length === 0)
 * ```
 * @category models
 * @since 0.0.0
 */
export type DesktopWireNode = typeof DesktopWireNode.Type;

/** Versioned logging packet, separate from ordinary user argument objects.
 * **Example** (Represent an undefined root)
 * ```ts
 * import { DesktopLogWire, DesktopWireValue } from "./DesktopLogWire.model.js"
 * console.assert(DesktopLogWire.make({ format: "vidbee-log-graph/1", root: DesktopWireValue.cases.Value.make({ value: undefined }), nodes: [] }).nodes.length === 0)
 * ```
 * @category models
 * @since 0.0.0
 */
export class DesktopLogWire extends S.Opaque<DesktopLogWire, { readonly brand: unique symbol }>()(
  S.Struct({
    format: S.Literal("vidbee-log-graph/1"),
    root: DesktopWireValue,
    nodes: S.Array(DesktopWireNode).check(S.isMaxLength(DesktopLogBudgets.maxNodes)),
  }).pipe(
    $I.annoteSchema("DesktopLogWire", {
      description: "Schema-validated structured-clone graph envelope for process logging.",
    })
  )
) {}

/** Content-free admission result paired with an optional validated entry.
 * **Example** (Represent a rejection)
 * ```ts
 * import { DesktopLogAdmission, DesktopLogWireWork } from "./DesktopLogWire.model.js"
 * import * as O from "effect/Option"
 * console.assert(O.isNone(DesktopLogAdmission.make({ entry: O.none(), work: DesktopLogWireWork.make({ inspected: 0, allocatedNodes: 0, allocatedSlots: 0 }) }).entry))
 * ```
 * @category models
 * @since 0.0.0
 */
export class DesktopLogAdmission extends S.Opaque<DesktopLogAdmission, { readonly brand: unique symbol }>()(
  S.Struct({ entry: S.Option(DesktopLogEntry), work: DesktopLogWireWork }).pipe(
    $I.annoteSchema("DesktopLogAdmission", {
      description: "Bounded production admission result and reconstruction work.",
    })
  )
) {}
