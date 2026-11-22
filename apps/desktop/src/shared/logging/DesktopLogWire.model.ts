import { $DesktopId } from "@vidbee/identity/packages";
import * as S from "effect/Schema";

const $I = $DesktopId.create("shared/logging/DesktopLogWire.model");

/** A graph edge or an opaque value supported by Electron structured cloning.
 * **Example** (Reference the first node)
 * ```ts
 * import { DesktopWireValue } from "./DesktopLogWire.model.js"
 * DesktopWireValue.cases.Reference.make({ index: 0 })
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
 * void value
 * ```
 * @category models
 * @since 0.0.0
 */
export type DesktopWireValue = typeof DesktopWireValue.Type;

/** Graph nodes retain cycles, array holes and native Error properties.
 * **Example** (Represent an empty array)
 * ```ts
 * import { DesktopWireNode } from "./DesktopLogWire.model.js"
 * DesktopWireNode.cases.Array.make({ length: 0, fields: [] })
 * ```
 * @category models
 * @since 0.0.0
 */
export const DesktopWireNode = S.TaggedUnion({
  Record: { fields: S.Array(S.Tuple([S.String, S.Boolean, DesktopWireValue])) },
  Array: {
    length: S.Int.check(S.isGreaterThanOrEqualTo(0), S.isLessThanOrEqualTo(4294967295)),
    fields: S.Array(S.Tuple([S.String, S.Boolean, DesktopWireValue])),
  },
  Error: {
    name: S.String,
    message: S.String,
    stack: S.UndefinedOr(S.String),
    fields: S.Array(S.Tuple([S.String, S.Boolean, DesktopWireValue])),
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
 * void node
 * ```
 * @category models
 * @since 0.0.0
 */
export type DesktopWireNode = typeof DesktopWireNode.Type;

/** Versioned logging packet, separate from ordinary user argument objects.
 * **Example** (Represent an undefined root)
 * ```ts
 * import { DesktopLogWire, DesktopWireValue } from "./DesktopLogWire.model.js"
 * DesktopLogWire.make({ format: "vidbee-log-graph/1", root: DesktopWireValue.cases.Value.make({ value: undefined }), nodes: [] })
 * ```
 * @category models
 * @since 0.0.0
 */
export class DesktopLogWire extends S.Opaque<DesktopLogWire, { readonly brand: unique symbol }>()(
  S.Struct({ format: S.Literal("vidbee-log-graph/1"), root: DesktopWireValue, nodes: S.Array(DesktopWireNode) }).pipe(
    $I.annoteSchema("DesktopLogWire", {
      description: "Schema-validated structured-clone graph envelope for process logging.",
    })
  )
) {}
