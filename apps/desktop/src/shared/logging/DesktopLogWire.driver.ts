import * as A from "effect/Array";
import * as MutableHashSet from "effect/MutableHashSet";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import { DesktopLogEntry, DesktopLogLevel } from "./DesktopLog.model.js";
import {
  DesktopLogBudgets as B,
  DesktopLogAdmission,
  DesktopLogWire,
  DesktopLogWireWork,
  DesktopWireNode,
  DesktopWireValue,
} from "./DesktopLogWire.model.js";

// Conservative payload accounting, not an estimate of an exact engine heap layout.
const charge = Object.freeze({
  scalarBytes: 16,
  stringUnitBytes: 4,
  objectBytes: 64,
  fieldBytes: 32,
  arraySlotBytes: 8,
  dateBytes: 8,
  bitsPerByte: 8,
});
const bigintLimit = 2n ** BigInt(B.maxBigIntBits);
const plain = (value: object): boolean => {
  const prototype: object | null = Reflect.getPrototypeOf(value);
  return prototype === null || Reflect.getPrototypeOf(prototype) === null;
};
const primitive = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  P.isString(value) ||
  P.isNumber(value) ||
  P.isBoolean(value) ||
  P.isBigInt(value);
const schemaKeys = [
  "format",
  "root",
  "nodes",
  "_tag",
  "index",
  "value",
  "fields",
  "name",
  "message",
  "stack",
  "cause",
  "errors",
  "level",
  "scope",
  "args",
  "context",
  "reasons",
  "annotations",
  "spans",
];
const properties = (value: object, schemaFields = false): Array<string> => {
  const keys: Array<string> = [];
  // Stop enumerating before building an unbounded ownKeys snapshot. Structured
  // clone supplies enumerable data properties; Error's four native slots are extra.
  for (const key in value) {
    if (keys.length >= B.maxFields) return keys;
    keys.push(key);
  }
  if (schemaFields || P.isError(value))
    A.forEach(schemaFields ? schemaKeys : ["name", "message", "stack", "cause", "errors"], (key) => {
      if (!A.contains(keys, key) && Reflect.getOwnPropertyDescriptor(value, key) !== undefined) keys.push(key);
    });
  return keys;
};
// Chromium exposes Error.stack through one realm-owned native accessor. Capture
// its identity from a foreign Error instance; never whitelist application getters.
const nativeStackGetter = Reflect.getOwnPropertyDescriptor(new Error(), "stack")?.get;
const data = (value: object, key: string): O.Option<unknown> => {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (descriptor !== undefined && "value" in descriptor) return O.some(descriptor.value);
  if (key === "stack" && P.isError(value) && nativeStackGetter !== undefined && descriptor?.get === nativeStackGetter) {
    const stack: unknown = Reflect.apply(nativeStackGetter, value, []);
    return O.some(stack);
  }
  return O.none();
};

const scan = (input: unknown, packet: boolean, inspect: () => boolean): boolean => {
  const pending: Array<{ value: unknown; depth: number; parents: ReadonlyArray<object> }> = [
    { value: input, depth: 0, parents: [] },
  ];
  let bytes = 0;
  let objects = 0;
  let fields = 0;
  let slots = 0;
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === undefined || !inspect() || task.depth > B.maxDepth) return false;
    const value = task.value;
    bytes += charge.scalarBytes;
    if (bytes > B.maxPayloadBytes) return false;
    if (P.isString(value)) {
      if (value.length > B.maxStringLength) return false;
      bytes += value.length * charge.stringUnitBytes;
    } else if (P.isBigInt(value)) {
      if (value >= bigintLimit || value <= -bigintLimit) return false;
      bytes += B.maxBigIntBits / charge.bitsPerByte;
    } else if (!primitive(value)) {
      if (!P.isObjectOrArray(value)) return false;
      if (A.some(task.parents, (parent) => parent === value)) continue;
      if (value instanceof Date) {
        bytes += charge.dateBytes;
      } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        bytes += value.byteLength;
      }
      {
        if (bytes > B.maxPayloadBytes) return false;
        if (
          !A.isArray(value) &&
          !P.isError(value) &&
          !plain(value) &&
          !(value instanceof Date) &&
          !(value instanceof ArrayBuffer) &&
          !ArrayBuffer.isView(value)
        )
          return false;
        objects++;
        bytes += charge.objectBytes;
        if (objects > (packet ? B.maxInspectedValues : B.maxNodes)) return false;
        if (A.isArray(value)) {
          if (value.length > B.maxArrayLength) return false;
          slots += value.length;
          bytes += value.length * charge.arraySlotBytes;
          if (slots > B.maxArraySlots) return false;
        }
        const keys = properties(value, true);
        fields += keys.length;
        if (fields > (packet ? B.maxInspectedValues : B.maxFields) || keys.length >= B.maxFields) return false;
        const parents = [...task.parents, value];
        for (const key of keys) {
          if (key.length > B.maxStringLength) return false;
          bytes += charge.fieldBytes + key.length * charge.stringUnitBytes;
          const property = data(value, key);
          if (O.isNone(property)) return false; // Only the realm-owned native Error.stack accessor is admitted.
          pending.push({ value: property.value, depth: task.depth + 1, parents });
        }
      }
    }
    if (bytes > B.maxPayloadBytes) return false;
  }
  return true;
};

const validateGraph = (packet: DesktopLogWire, inspect: () => boolean): boolean => {
  const valid = (value: DesktopWireValue): boolean => value._tag === "Value" || value.index < packet.nodes.length;
  if (!valid(packet.root) || packet.root._tag !== "Reference") return false;
  let fields = 0;
  let slots = 0;
  let bytes = 0;
  for (const node of packet.nodes) {
    if (!inspect()) return false;
    fields += node.fields.length;
    if (fields > B.maxFields) return false;
    if (node._tag === "Array") {
      slots += node.length;
      bytes += node.length * charge.arraySlotBytes;
    }
    if (slots > B.maxArraySlots || bytes > B.maxPayloadBytes) return false;
    const keys = MutableHashSet.empty<string>();
    for (const [key, , value] of node.fields) {
      if (MutableHashSet.has(keys, key)) return false;
      MutableHashSet.add(keys, key);
      if (!inspect() || !valid(value)) return false;
      if (
        value._tag === "Value" &&
        !primitive(value.value) &&
        !(value.value instanceof Date) &&
        !(value.value instanceof ArrayBuffer) &&
        !ArrayBuffer.isView(value.value)
      )
        return false;
      // Numeric keys must be inside the declared length, not merely inside a
      // nominal global limit. defineProperty otherwise silently grows the array.
      if (node._tag === "Array" && (key === "length" || (/^(0|[1-9][0-9]*)$/.test(key) && Number(key) >= node.length)))
        return false;
    }
  }
  const root = packet.nodes[packet.root.index];
  if (root?._tag !== "Record") return false;
  const level = A.findFirst(root.fields, ([key]) => key === "level");
  const scope = A.findFirst(root.fields, ([key]) => key === "scope");
  if (O.isNone(level) || level.value[2]._tag !== "Value" || !S.is(DesktopLogLevel)(level.value[2].value)) return false;
  if (O.isNone(scope) || scope.value[2]._tag !== "Value" || !P.isString(scope.value[2].value)) return false;
  const args = A.findFirst(root.fields, ([key]) => key === "args");
  if (O.isNone(args) || args.value[2]._tag !== "Reference") return false;
  const argumentsNode = packet.nodes[args.value[2].index];
  if (argumentsNode?._tag !== "Array" || argumentsNode.length > B.maxArguments) return false;
  const pending = [{ index: packet.root.index, depth: 0, parents: A.empty<number>() }];
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === undefined || !inspect()) return false;
    if (A.contains(task.parents, task.index)) continue;
    if (task.depth > B.maxDepth) return false;
    const node = packet.nodes[task.index];
    if (node === undefined) return false;
    const parents = [...task.parents, task.index];
    for (const [, , value] of node.fields) {
      if (!inspect() || pending.length >= B.maxFields) return false;
      if (value._tag === "Reference") pending.push({ index: value.index, depth: task.depth + 1, parents });
    }
  }
  return true;
};

/** Visible sender degradation; its fixed payload never repeats rejected content.
 * **Example** (Recognize a truncated diagnostic)
 * ```ts
 * import { DesktopLogTruncation } from "./DesktopLogWire.driver.js"
 * import * as Str from "effect/String"
 * console.assert(Str.includes("truncated")(DesktopLogTruncation))
 * ```
 * @category configuration
 * @since 0.0.0
 */
export const DesktopLogTruncation = "[desktop log truncated: IPC budget exceeded or unsupported payload]";

const encode = (entry: DesktopLogEntry): DesktopLogWire => {
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
    const fields: Array<readonly [string, boolean, DesktopWireValue]> = A.map(properties(value), (key) => [
      key,
      Reflect.getOwnPropertyDescriptor(value, key)?.enumerable === true,
      visit(data(value, key).pipe(O.getOrUndefined)),
    ]);
    nodes[index] = P.isError(value)
      ? DesktopWireNode.cases.Error.make({ name: value.name, message: value.message, stack: value.stack, fields })
      : A.isArray(value)
        ? DesktopWireNode.cases.Array.make({ length: value.length, fields })
        : DesktopWireNode.cases.Record.make({ fields });
    return DesktopWireValue.cases.Reference.make({ index });
  };
  return DesktopLogWire.make({ format: "vidbee-log-graph/1", root: visit(entry), nodes });
};

// Read cardinalities as data properties before asking Schema to decode containers.
const graphCardinalities = (input: unknown, inspect: () => boolean): boolean => {
  if (!P.isObject(input)) return false;
  const nodes = data(input, "nodes");
  if (O.isNone(nodes) || !A.isArray(nodes.value) || nodes.value.length > B.maxNodes) return false;
  let fields = 0;
  let slots = 0;
  for (const node of nodes.value) {
    if (!inspect() || !P.isObject(node)) return false;
    const properties = data(node, "fields");
    if (O.isNone(properties) || !A.isArray(properties.value)) return false;
    fields += properties.value.length;
    if (fields > B.maxFields) return false;
    const tag = data(node, "_tag");
    if (O.isSome(tag) && tag.value === "Array") {
      const length = data(node, "length");
      if (
        O.isNone(length) ||
        !P.isNumber(length.value) ||
        !Number.isSafeInteger(length.value) ||
        length.value < 0 ||
        length.value > B.maxArrayLength
      )
        return false;
      slots += length.value;
      if (slots > B.maxArraySlots) return false;
      for (const field of properties.value) {
        if (!inspect() || !A.isArray(field)) return false;
        const key = data(field, "0");
        if (
          O.isNone(key) ||
          !P.isString(key.value) ||
          key.value === "length" ||
          (/^(0|[1-9][0-9]*)$/.test(key.value) && Number(key.value) >= length.value)
        )
          return false;
      }
    }
  }
  return true;
};

const admitted = (input: unknown, inspect: () => boolean): O.Option<DesktopLogWire> => {
  if (!scan(input, true, inspect) || !graphCardinalities(input, inspect)) return O.none();
  const parsed = S.decodeUnknownOption(DesktopLogWire)(input);
  return O.isSome(parsed) && validateGraph(parsed.value, inspect) ? parsed : O.none();
};

/** Encode a bounded diagnostic; oversized/unsupported entries become a visible marker.
 * Native main-process sinks and legacy routes do not use this codec.
 * **Example** (Preserve primitive arguments)
 * ```ts
 * import { encodeDesktopLog, decodeDesktopLog } from "./DesktopLogWire.driver.js"
 * import { DesktopLogEntry } from "./DesktopLog.model.js"
 * import * as O from "effect/Option"
 * console.assert(O.isSome(decodeDesktopLog(encodeDesktopLog(DesktopLogEntry.make({ level: "info", scope: "", args: [42n, undefined] })))))
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const encodeDesktopLog = (entry: DesktopLogEntry): DesktopLogWire => {
  try {
    let inspected = 0;
    const inspect = () => ++inspected <= B.maxInspectedValues;
    if (entry.args.length <= B.maxArguments && scan(entry, false, inspect)) {
      const packet = encode(entry);
      if (O.isSome(admitted(packet, inspect))) return packet;
    }
  } catch {
    /* Unsafe getters/proxies are not a second logging path. */
  }
  return encode(DesktopLogEntry.make({ level: "warn", scope: "", args: [DesktopLogTruncation] }));
};

const decode = (input: unknown, report: (work: DesktopLogWireWork) => void): O.Option<DesktopLogEntry> => {
  let inspected = 0;
  let allocatedNodes = 0;
  let allocatedSlots = 0;
  const inspect = () => ++inspected <= B.maxInspectedValues;
  try {
    if (!P.isObject(input)) return O.none();
    const format = data(input, "format");
    if (O.isNone(format)) {
      const args = data(input, "args");
      if (
        O.isNone(args) ||
        !A.isArray(args.value) ||
        args.value.length > B.maxArguments ||
        !scan(input, false, inspect)
      )
        return O.none();
      return S.decodeUnknownOption(DesktopLogEntry)(input);
    }
    const parsed = admitted(input, inspect);
    if (O.isNone(parsed)) return O.none();
    const packet = parsed.value;
    const values: Array<object> = A.map(packet.nodes, (node) => {
      allocatedNodes++;
      if (node._tag === "Array") {
        allocatedSlots += node.length;
        return A.allocate<unknown>(node.length);
      }
      if (node._tag === "Record") return {};
      const error = new Error(node.message); // Reconstruct a foreign Error, not a domain failure.
      return error;
    });
    const valueOf = (value: DesktopWireValue): unknown => (value._tag === "Value" ? value.value : values[value.index]);
    A.forEach(packet.nodes, (node, index) => {
      const target = values[index];
      if (target !== undefined) {
        A.forEach(node.fields, ([key, enumerable, value]) => {
          Reflect.defineProperty(target, key, {
            value: valueOf(value),
            enumerable,
            writable: true,
            configurable: true,
          });
        });
        if (node._tag === "Error") {
          Reflect.defineProperty(target, "name", { value: node.name, writable: true, configurable: true });
          Reflect.defineProperty(target, "stack", { value: node.stack, writable: true, configurable: true });
          Reflect.defineProperty(target, "message", { value: node.message, writable: true, configurable: true });
        }
      }
    });
    return S.decodeUnknownOption(DesktopLogEntry)(valueOf(packet.root));
  } catch {
    return O.none();
  } finally {
    report(DesktopLogWireWork.make({ inspected, allocatedNodes, allocatedSlots }));
  }
};

/** Admit before reconstruction, including the bounded raw-entry compatibility surface.
 * Rejects silently: no recursive diagnostics, retries or application getter execution.
 * Work reports count inspected values and actual reconstruction allocations.
 * **Example** (Reject invalid input without allocation)
 * ```ts
 * import { decodeDesktopLog } from "./DesktopLogWire.driver.js"
 * import * as O from "effect/Option"
 * console.assert(O.isNone(decodeDesktopLog({ invalid: true })))
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const decodeDesktopLog = (input: unknown): O.Option<DesktopLogEntry> => decode(input, () => {});

/** Inspect the same production admission path with content-free allocation counts.
 * **Example** (Observe rejection before reconstruction)
 * ```ts
 * import { inspectDesktopLog } from "./DesktopLogWire.driver.js"
 * console.assert(inspectDesktopLog({ invalid: true }).work.allocatedNodes === 0)
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const inspectDesktopLog = (input: unknown): DesktopLogAdmission => {
  let work = DesktopLogWireWork.make({ inspected: 0, allocatedNodes: 0, allocatedSlots: 0 });
  const entry = decode(input, (observed) => {
    work = observed;
  });
  return DesktopLogAdmission.make({ entry, work });
};
