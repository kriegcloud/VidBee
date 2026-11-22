import * as A from "effect/Array";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import { DesktopLogWire, DesktopWireNode, DesktopWireValue } from "./DesktopLogWire.model.js";
import type { DesktopLogEntry } from "./DesktopLog.model.js";

const plain = (value: object): boolean => {
  const prototype: object | null = Reflect.getPrototypeOf(value);
  return prototype === null || Reflect.getPrototypeOf(prototype) === null;
};

/** Encode Error properties before contextBridge's Error copier can drop cause.
 * Other native cloneable types pass through unchanged. References retain cycles.
 * **Example** (Encode a logging entry)
 * ```ts
 * import { encodeDesktopLog } from "./DesktopLogWire.driver.js"
 * import { DesktopLogEntry } from "./DesktopLog.model.js"
 * encodeDesktopLog(DesktopLogEntry.make({ level: "info", scope: "", args: [42n, undefined] }))
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const encodeDesktopLog = (entry: DesktopLogEntry): DesktopLogWire => {
  const seen: Array<readonly [object, number]> = [];
  const nodes: Array<DesktopWireNode> = [];
  const visit = (value: unknown): DesktopWireValue => {
    if (!P.isObjectOrArray(value) || (!A.isArray(value) && !P.isError(value) && !plain(value)))
      return DesktopWireValue.cases.Value.make({ value });
    const previous = A.findFirst(seen, ([object]) => object === value);
    if (O.isSome(previous)) return DesktopWireValue.cases.Reference.make({ index: previous.value[1] });
    const index = nodes.length;
    seen.push([value, index]);
    nodes.push(DesktopWireNode.cases.Record.make({ fields: [] }));
    const keys = A.filter(
      Reflect.ownKeys(value),
      (key): key is string =>
        P.isString(key) && (P.isError(value) || Reflect.getOwnPropertyDescriptor(value, key)?.enumerable === true)
    );
    const fields: Array<readonly [string, boolean, DesktopWireValue]> = A.map(keys, (key) => {
      const property: unknown = Reflect.get(value, key);
      return [key, Reflect.getOwnPropertyDescriptor(value, key)?.enumerable === true, visit(property)];
    });
    nodes[index] = P.isError(value)
      ? DesktopWireNode.cases.Error.make({ name: value.name, message: value.message, stack: value.stack, fields })
      : A.isArray(value)
        ? DesktopWireNode.cases.Array.make({ length: value.length, fields })
        : DesktopWireNode.cases.Record.make({ fields });
    return DesktopWireValue.cases.Reference.make({ index });
  };
  return DesktopLogWire.make({ format: "vidbee-log-graph/1", root: visit(entry), nodes });
};

/** Decode validated graph references; malformed graphs are dropped, never thrown.
 * Native Error allocation here reconstructs a foreign transport value, not a domain failure.
 * **Example** (Decode an encoded entry)
 * ```ts
 * import { decodeDesktopLog, encodeDesktopLog } from "./DesktopLogWire.driver.js"
 * import { DesktopLogEntry } from "./DesktopLog.model.js"
 * decodeDesktopLog(encodeDesktopLog(DesktopLogEntry.make({ level: "info", scope: "", args: [] })))
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const decodeDesktopLog = (input: unknown): O.Option<unknown> => {
  const parsed = S.decodeUnknownOption(DesktopLogWire)(input);
  if (O.isNone(parsed)) return O.some(input); // Retain the original decoded-entry bridge surface.
  const packet = parsed.value;
  const valid = (value: DesktopWireValue): boolean => value._tag === "Value" || value.index < packet.nodes.length;
  if (
    !valid(packet.root) ||
    !A.every(packet.nodes, (node) =>
      A.every(node.fields, ([key, , value]) => valid(value) && (node._tag !== "Array" || key !== "length"))
    )
  )
    return O.none();
  const values: Array<object> = A.map(packet.nodes, (node) => {
    if (node._tag === "Array") return A.allocate<unknown>(node.length);
    if (node._tag === "Record") return {};
    const error = new Error(node.message);
    Reflect.defineProperty(error, "name", { value: node.name, writable: true, configurable: true });
    Reflect.defineProperty(error, "stack", { value: node.stack, writable: true, configurable: true });
    return error;
  });
  const valueOf = (value: DesktopWireValue): unknown => (value._tag === "Value" ? value.value : values[value.index]);
  A.forEach(packet.nodes, (node, index) => {
    const target = values[index];
    if (target !== undefined)
      A.forEach(node.fields, ([key, enumerable, value]) => {
        Reflect.defineProperty(target, key, {
          value: valueOf(value),
          enumerable,
          writable: true,
          configurable: true,
        });
      });
  });
  return O.some(valueOf(packet.root));
};
