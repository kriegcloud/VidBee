import * as Context from "effect/Context";
import * as HashMap from "effect/HashMap";
import * as O from "effect/Option";
import * as S from "effect/Schema";
import * as Str from "effect/String";
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
export const Input = S.Struct({
  version: S.optionalKey(S.Literal(1)),
  session: S.String,
  client: Counter,
  message: FromClient,
});
export type Input = typeof Input.Type;
export const Output = S.Struct({
  version: S.optionalKey(S.Literal(1)),
  session: S.String,
  client: Counter,
  message: S.Union([
    FromServer,
    S.TaggedStruct("Terminal", { response: ResponseExit }),
    S.TaggedStruct("DocumentClosed", {}),
  ]),
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

/** Logical retention ownership. A transfer reserves its destination before releasing its source. */
export interface RetentionLease {
  readonly bytes: () => number;
  readonly control: boolean;
  readonly release: () => void;
  readonly resize: (bytes: number) => boolean;
}
export interface RetentionAccount {
  readonly reserve: (bytes: number, control?: boolean) => RetentionLease | undefined;
}
/** No encoded byte buffer is allocated merely to measure incoming JSON. */
export const measureFrame = (text: string) => {
  let utf8 = 0;
  let structure = 1;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const code = O.getOrElse(Str.charCodeAt(i)(text), () => 0);
    if (code < 128) utf8++;
    else if (code < 2048) utf8 += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < text.length &&
      O.getOrElse(Str.charCodeAt(i + 1)(text), () => 0) >= 0xdc00 &&
      O.getOrElse(Str.charCodeAt(i + 1)(text), () => 0) <= 0xdfff
    ) {
      utf8 += 4;
      i++;
      continue;
    } else utf8 += 3;
    if (escaped) escaped = false;
    else if (quoted && code === 92) escaped = true;
    else if (code === 34) quoted = !quoted;
    else if (!quoted && (code === 44 || code === 58 || code === 91 || code === 123)) structure++;
  }
  // String + UTF8 IPC copy + decoded strings/nodes, including property/array overhead.
  return { utf8, retained: 4 * text.length + utf8 + 128 * structure };
};

/** Shared by all transport and amendment owners in a process; window accounts survive reload. */
export const makeRetentionLedger = ({
  windowBytes = 128 * 1024 * 1024,
  appBytes = 2 * 1024 * 1024 * 1024,
  documentBytes = windowBytes,
  controlBytes = 64 * 1024,
}: {
  readonly windowBytes?: number;
  readonly appBytes?: number;
  readonly documentBytes?: number;
  readonly controlBytes?: number;
} = {}) => {
  interface Window {
    control: number;
    data: number;
    documents: number;
    leases: number;
  }
  interface Document {
    control: number;
    data: number;
    live: boolean;
    readonly window: Window;
  }
  let windows = HashMap.empty<string, Window>();
  let documents = HashMap.empty<string, Document>();
  let data = 0;
  let control = 0;
  let peak = 0;
  let leases = 0;
  const prune = (window: Window) => {
    if (window.data !== 0 || window.control !== 0 || window.documents !== 0 || window.leases !== 0) return;
    for (const [key, value] of HashMap.toEntries(windows)) if (value === window) windows = HashMap.remove(windows, key);
  };
  const account = (window: Window, doc?: Document): RetentionAccount => ({
    reserve: (initial, isControl = false) => {
      if (doc !== undefined && !doc.live) return undefined;
      let size = 0;
      let live = true;
      const resize = (next: number) => {
        if (!live || !Number.isSafeInteger(next) || next < 0) return false;
        const delta = next - size;
        if (delta > 0 && doc !== undefined && !doc.live) return false;
        if (isControl) {
          if (doc === undefined || doc.control + delta > controlBytes || control + delta > controlBytes * 16)
            return false;
          doc.control += delta;
          window.control += delta;
          control += delta;
        } else {
          if (
            window.data + delta > windowBytes ||
            data + delta > appBytes ||
            (doc !== undefined && doc.data + delta > documentBytes)
          )
            return false;
          window.data += delta;
          data += delta;
          if (doc !== undefined) doc.data += delta;
          peak = Math.max(peak, data);
        }
        size = next;
        return true;
      };
      if (!resize(initial)) {
        prune(window);
        return undefined;
      }
      leases++;
      window.leases++;
      return {
        control: isControl,
        resize,
        bytes: () => size,
        release: () => {
          if (!live) return;
          resize(0);
          live = false;
          leases--;
          window.leases--;
          prune(window);
        },
      };
    },
  });
  const getWindow = (id: string): Window => {
    const window = O.getOrElse(HashMap.get(windows, id), () => ({ data: 0, control: 0, documents: 0, leases: 0 }));
    windows = HashMap.set(windows, id, window);
    return window;
  };
  // A cached window handle always resolves the current canonical account after an idle retirement.
  const forWindow = (id: string): RetentionAccount => ({
    reserve: (bytes, control) => account(getWindow(id)).reserve(bytes, control),
  });
  return {
    forWindow,
    connect: (id: string, origin: string) => {
      if (HashMap.has(documents, id)) return true;
      if (HashMap.size(documents) >= 16) return false;
      const window = getWindow(origin);
      window.documents++;
      documents = HashMap.set(documents, id, { window, data: 0, control: 0, live: true });
      return true;
    },
    document: (id: string): RetentionAccount | undefined =>
      O.match(HashMap.get(documents, id), { onNone: () => undefined, onSome: (doc) => account(doc.window, doc) }),
    disconnect: (id: string) => {
      const doc = HashMap.get(documents, id);
      if (O.isNone(doc)) return;
      doc.value.live = false;
      doc.value.window.documents--;
      documents = HashMap.remove(documents, id);
      prune(doc.value.window);
    },
    stats: () => ({ data, control, peak, leases, windows: HashMap.size(windows), documents: HashMap.size(documents) }),
  };
};

/** Upper bound for JSON serialization and retained plain-data traversal, before stringify. */
export const measureValue = (input: unknown): number | undefined => {
  let nodes = 0;
  const visit = (value: unknown, ancestors: ReadonlyArray<object>, depth: number): number | undefined => {
    if (++nodes > 65536 || depth > 64) return undefined;
    if (typeof value === "string") {
      let escapes = 0;
      for (let index = 0; index < value.length; index++) {
        const code = O.getOrElse(Str.charCodeAt(index)(value), () => 0);
        if (code < 32) escapes += 5;
        else if (code === 34 || code === 92) escapes++;
        else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
          const next = O.getOrElse(Str.charCodeAt(index + 1)(value), () => 0);
          if (next >= 0xdc00 && next <= 0xdfff) index++;
          else escapes += 5;
        } else if (code >= 0xd800 && code <= 0xdfff) escapes += 5;
      }
      return 128 + 4 * (value.length + escapes + 2) + measureFrame(value).utf8 + escapes + 2;
    }
    if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return 128;
    if (typeof value !== "object" || ancestors.includes(value)) return undefined;
    let size = 256;
    const next = [...ancestors, value];
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable !== true) continue;
      if (typeof key !== "string" || !("value" in descriptor)) return undefined;
      const child: unknown = descriptor.value;
      const amount = visit(child, next, depth + 1);
      if (amount === undefined) return undefined;
      size += key.length * 32 + amount + 128;
      if (size > 128 * 1024 * 1024) return undefined;
    }
    return size;
  };
  return visit(input, [], 0);
};

export const ResourceDomain = S.Literals([
  "registration",
  "cut",
  "watermark",
  "repair",
  "repairEntry",
  "invocation",
  "auth",
]);
export type ResourceDomain = typeof ResourceDomain.Type;
/** One instance per document, passed to every subordinate owner. */
export const makeResourceBudget = (account: RetentionAccount) => {
  let held = HashMap.empty<ResourceDomain, { count: number; bytes: number }>();
  const bounds = (domain: ResourceDomain): readonly [number, number] => {
    switch (domain) {
      case "registration":
        return [1024, 128 * 1024 * 1024];
      case "cut":
        return [1024, 4 * 1024 * 1024];
      case "watermark":
        return [4096, 2 * 1024 * 1024];
      case "repair":
        return [16, 4096];
      case "repairEntry":
        return [32768, 4 * 1024 * 1024];
      case "invocation":
        return [1024, 4 * 1024 * 1024];
      case "auth":
        return [256, 256 * 1024];
    }
  };
  return {
    account,
    claim: (domain: ResourceDomain, initial: number): RetentionLease | undefined => {
      const state = O.getOrElse(HashMap.get(held, domain), () => ({ count: 0, bytes: 0 }));
      const [maxCount, maxBytes] = bounds(domain);
      if (state.count >= maxCount || state.bytes + initial > maxBytes) return undefined;
      const retained = account.reserve(initial);
      if (retained === undefined) return undefined;
      held = HashMap.set(held, domain, state);
      state.count++;
      state.bytes += initial;
      let live = true;
      return {
        control: false,
        bytes: retained.bytes,
        resize: (next) => {
          if (!live || state.bytes + next - retained.bytes() > maxBytes) return false;
          const old = retained.bytes();
          if (!retained.resize(next)) return false;
          state.bytes += next - old;
          return true;
        },
        release: () => {
          if (!live) return;
          live = false;
          state.count--;
          state.bytes -= retained.bytes();
          retained.release();
          if (state.count === 0) held = HashMap.remove(held, domain);
        },
      };
    },
    stats: () => held,
  };
};
export type ResourceBudget = ReturnType<typeof makeResourceBudget>;

export class DocumentResources extends Context.Service<DocumentResources, ResourceBudget>()(
  "vidbee/renderer/src/transport/ElectronRpc.model/DocumentResources"
) {}
