import { $DesktopId } from "@vidbee/identity/packages";
import { LiteralKit } from "@vidbee/schema/LiteralKit";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as S from "effect/Schema";
import * as Getter from "effect/SchemaGetter";
import * as Issue from "effect/SchemaIssue";
import * as Str from "effect/String";
import { Counter, Registered } from "./DocumentDelivery.model.js";

const $TransportId = $DesktopId.create("renderer/src/transport/ElectronRpc.model");

/**
 * Validates Request Id at the desktop transport boundary before dispatch.
 *
 * **Example** (Use RequestId at its owning boundary)
 *
 * ```ts
 * import { RequestId } from "./ElectronRpc.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(RequestId);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const RequestId = S.Union([S.String, S.Finite]).pipe(
  $TransportId.annoteSchema("RequestId", { description: "Request Id boundary in the desktop transport contract." })
);
/**
 * Describes Request Id ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
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
}).pipe($TransportId.annoteSchema("Request", { description: "Request boundary in the desktop transport contract." }));
/**
 * Validates From Client at the desktop transport boundary before dispatch.
 *
 * **Example** (Use FromClient at its owning boundary)
 *
 * ```ts
 * import { FromClient } from "./ElectronRpc.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(FromClient);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const FromClient = S.Union([
  Request,
  S.TaggedStruct("Ack", { requestId: RequestId }),
  S.TaggedStruct("Interrupt", { requestId: RequestId }),
  S.TaggedStruct("Ping", {}),
  S.TaggedStruct("Eof", {}),
]).pipe(
  $TransportId.annoteSchema("FromClient", { description: "From Client boundary in the desktop transport contract." })
);
/**
 * Describes From Client ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
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
]).pipe(
  $TransportId.annoteSchema("EncodedExit", { description: "Encoded Exit boundary in the desktop transport contract." })
);
/**
 * Validates Response Exit at the desktop transport boundary before dispatch.
 *
 * **Example** (Use ResponseExit at its owning boundary)
 *
 * ```ts
 * import { ResponseExit } from "./ElectronRpc.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ResponseExit);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ResponseExit = S.TaggedStruct("Exit", { requestId: RequestId, exit: EncodedExit }).pipe(
  $TransportId.annoteSchema("ResponseExit", {
    description: "Response Exit boundary in the desktop transport contract.",
  })
);
/**
 * Describes Response Exit ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ResponseExit = typeof ResponseExit.Type;
/**
 * Validates From Server at the desktop transport boundary before dispatch.
 *
 * **Example** (Use FromServer at its owning boundary)
 *
 * ```ts
 * import { FromServer } from "./ElectronRpc.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(FromServer);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const FromServer = S.Union([
  ResponseExit,
  S.TaggedStruct("Chunk", { requestId: RequestId, values: S.NonEmptyArray(S.Unknown) }),
  S.TaggedStruct("Defect", { defect: S.Unknown }),
  S.TaggedStruct("Pong", {}),
]).pipe(
  $TransportId.annoteSchema("FromServer", { description: "From Server boundary in the desktop transport contract." })
);
/**
 * Describes From Server ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type FromServer = typeof FromServer.Type;
/**
 * Validates Input at the desktop transport boundary before dispatch.
 *
 * **Example** (Use Input at its owning boundary)
 *
 * ```ts
 * import { Input } from "./ElectronRpc.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Input);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Input = S.Struct({
  version: S.optionalKey(S.Literal(1)),
  session: S.String,
  client: Counter,
  message: S.Union([FromClient, S.TaggedStruct("StorageReleased", { storageId: Counter })]),
}).pipe($TransportId.annoteSchema("Input", { description: "Input boundary in the desktop transport contract." }));
/**
 * Describes Input ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Input = typeof Input.Type;
/**
 * Validates Output at the desktop transport boundary before dispatch.
 *
 * **Example** (Use Output at its owning boundary)
 *
 * ```ts
 * import { Output } from "./ElectronRpc.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Output);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Output = S.Struct({
  version: S.optionalKey(S.Literal(1)),
  session: S.String,
  client: Counter,
  storageId: S.optionalKey(Counter),
  message: S.Union([
    FromServer,
    S.TaggedStruct("Terminal", { response: ResponseExit, subscription: S.optionalKey(Registered) }),
    S.TaggedStruct("DocumentClosed", {}),
  ]),
}).pipe($TransportId.annoteSchema("Output", { description: "Output boundary in the desktop transport contract." }));
/**
 * Describes Output ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Output = typeof Output.Type;
/**
 * Validates Connect at the desktop transport boundary before dispatch.
 *
 * **Example** (Use Connect at its owning boundary)
 *
 * ```ts
 * import { Connect } from "./ElectronRpc.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Connect);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Connect = S.Struct({ session: S.String, generation: Counter, version: S.Literal(1) }).pipe(
  $TransportId.annoteSchema("Connect", { description: "Connect boundary in the desktop transport contract." })
);
/**
 * Describes Connect ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Connect = typeof Connect.Type;
/**
 * Constructs channels with explicit lifetime and failure ownership.
 *
 * **Example** (Use channels at its owning boundary)
 *
 * ```ts
 * import { channels } from "./ElectronRpc.model.js"
 * const messageChannel = channels.message;
 * void messageChannel;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const channels = {
  connect: "vidbee:rpc:connect:v1",
  message: "vidbee:rpc:message:v1",
  end: "vidbee:rpc:end:v1",
};
/**
 * Narrow, browser-safe preload surface. Registration must precede connect.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface DesktopRpcBridge {
  readonly connect: () => Promise<unknown>;
  readonly disconnect: (session: string) => void;
  readonly send: (frame: string) => void;
  readonly subscribe: (receive: (frame: unknown) => void) => () => void;
}

/**
 * Logical retention ownership. A transfer reserves its destination before releasing its source.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface RetentionLease {
  readonly bytes: () => number;
  readonly control: boolean;
  readonly release: () => void;
  readonly resize: (bytes: number) => boolean;
}
/**
 * Describes Retention Account ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface RetentionAccount {
  readonly reserve: (bytes: number, control?: boolean) => RetentionLease | undefined;
}
/**
 * No encoded byte buffer is allocated merely to measure incoming JSON.
 *
 * **Example** (Use measureFrame at its owning boundary)
 *
 * ```ts
 * import { measureFrame } from "./ElectronRpc.model.js"
 * const size = measureFrame("hello");
 * const fits = size.utf8 < 64 * 1024 * 1024;
 * void fits;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
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

/**
 * Shared by all transport and amendment owners in a process; window accounts survive reload.
 *
 * **Example** (Use makeRetentionLedger at its owning boundary)
 *
 * ```ts
 * import { makeRetentionLedger } from "./ElectronRpc.model.js"
 * const ledger = makeRetentionLedger();
 * ledger.connect("document", "window");
 * const lease = ledger.document("document")?.reserve(4096);
 * lease?.release();
 * ledger.disconnect("document");
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
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

/**
 * Upper bound for JSON serialization and retained plain-data traversal, before stringify.
 *
 * **Example** (Use measureValue at its owning boundary)
 *
 * ```ts
 * import { measureValue } from "./ElectronRpc.model.js"
 * const reservation = measureValue({ name: "hello" });
 * if (reservation !== undefined) { const requiredBytes = reservation; void requiredBytes; }
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const measureValue = (input: unknown): number | undefined => {
  let nodes = 0;
  const visit = (value: unknown, ancestors: ReadonlyArray<object>, depth: number): number | undefined => {
    if (S.is(S.Uint8Array)(value)) return 256 + value.byteLength * 2;
    if (++nodes > 65536 || depth > 64) return undefined;
    if (P.isString(value)) {
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
    if (value === null || value === undefined || P.isBoolean(value) || P.isNumber(value)) return 128;
    if (!P.isObjectOrArray(value) || ancestors.includes(value)) return undefined;
    let size = 256;
    const next = [...ancestors, value];
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable !== true) continue;
      if (!P.isString(key) || !("value" in descriptor)) return undefined;
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

/**
 * Validates Resource Domain at the desktop transport boundary before dispatch.
 *
 * **Example** (Use ResourceDomain at its owning boundary)
 *
 * ```ts
 * import { ResourceDomain } from "./ElectronRpc.model.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(ResourceDomain);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const ResourceDomain = LiteralKit([
  "registration",
  "cut",
  "watermark",
  "repair",
  "repairEntry",
  "invocation",
  "auth",
]).pipe(
  $TransportId.annoteSchema("ResourceDomain", {
    description: "Resource Domain boundary in the desktop transport contract.",
  })
);
/**
 * Describes Resource Domain ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ResourceDomain = typeof ResourceDomain.Type;
/**
 * One instance per document, passed to every subordinate owner.
 *
 * **Example** (Use makeResourceBudget at its owning boundary)
 *
 * ```ts
 * import { makeResourceBudget } from "./ElectronRpc.model.js"
 * import { makeRetentionLedger } from "./ElectronRpc.model.js";
 * const resources = makeResourceBudget(makeRetentionLedger().forWindow("window"));
 * const invocation = resources.claim("invocation", 256);
 * invocation?.release();
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeResourceBudget = (account: RetentionAccount) => {
  let held = HashMap.empty<ResourceDomain, { count: number; bytes: number }>();
  const bounds = Match.type<ResourceDomain>().pipe(
    Match.when("registration", () => [1024, 128 * 1024 * 1024] as const),
    Match.when("cut", () => [1024, 4 * 1024 * 1024] as const),
    Match.when("watermark", () => [4096, 2 * 1024 * 1024] as const),
    Match.when("repair", () => [16, 4096] as const),
    Match.when("repairEntry", () => [32768, 4 * 1024 * 1024] as const),
    Match.when("invocation", () => [1024, 4 * 1024 * 1024] as const),
    Match.when("auth", () => [256, 256 * 1024] as const),
    Match.exhaustive
  );
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
/**
 * Describes Resource Budget ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type ResourceBudget = ReturnType<typeof makeResourceBudget>;

/**
 * Supplies Document Resources through the owning application or document scope.
 *
 * **Example** (Use DocumentResources at its owning boundary)
 *
 * ```ts
 * import { DocumentResources } from "./ElectronRpc.model.js"
 * import * as Effect from "effect/Effect"
 * const access = DocumentResources.use(Effect.succeed);
 * void access;
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class DocumentResources extends Context.Service<DocumentResources, ResourceBudget>()(
  "vidbee/renderer/src/transport/ElectronRpc.model/DocumentResources"
) {}

/**
 * Reserves the entire admitted transformation arena before invoking an arbitrary RPC codec.
 *
 * **Example** (Use makeCodecOwnership at its owning boundary)
 *
 * ```ts
 * import { makeCodecOwnership } from "./ElectronRpc.model.js"
 * import * as S from "effect/Schema"
 * import * as Effect from "effect/Effect"
 * import { makeRetentionLedger } from "./ElectronRpc.model.js";
 * const ledger = makeRetentionLedger();
 * const owner = makeCodecOwnership({ account: () => ledger.forWindow("window") });
 * const encoded = S.encodeEffect(owner.codecFor(S.String))("hello");
 * void encoded.pipe(Effect.ensuring(Effect.sync(owner.close)));
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeCodecOwnership = ({
  account,
  ceiling = 64 * 1024 * 1024,
  decoded,
  refused,
}: {
  readonly account: () => RetentionAccount | undefined;
  readonly refused?: () => void;
  readonly ceiling?: number;
  readonly decoded?: (value: unknown, lease: RetentionLease) => boolean;
}) => {
  let pending = HashMap.empty<number, ReadonlyArray<RetentionLease>>();
  let observing = HashSet.empty<number>();
  const releaseFor = (id: number) => {
    for (const lease of O.getOrElse(HashMap.get(pending, id), () => [])) lease.release();
    pending = HashMap.remove(pending, id);
  };
  const release = () => releaseFor(Fiber.getCurrent()?.id ?? -1);
  const codecFor: RpcSerialization.CodecFor = <Schema extends S.Top>(schema: Schema) => {
    const codec = RpcSerialization.json
      .codecFor(schema)
      .pipe($TransportId.annoteSchema("codec", { description: "codec boundary in the desktop transport contract." }));
    const transform = Effect.fn("ElectronRpc.codec")(function* <A, R>(
      input: unknown,
      run: () => Effect.Effect<A, S.SchemaError, R>,
      decode: boolean
    ) {
      const lease = account()?.reserve(ceiling);
      if (lease === undefined) {
        refused?.();
        return yield* Effect.fail(new Issue.InvalidValue({ message: "CodecCapacity" }, input));
      }
      let transferred = false;
      return yield* Effect.gen(function* () {
        const value = yield* Effect.suspend(run).pipe(Effect.mapError((error) => error.issue));
        const size = measureValue(value);
        if (size === undefined || size > ceiling || !lease.resize(size)) {
          refused?.();
          return yield* Effect.fail(new Issue.InvalidValue({ message: "CodecCapacity" }, input));
        }
        if (decode && decoded?.(value, lease) === true) transferred = true;
        else {
          const id = Fiber.getCurrent()?.id ?? -1;
          pending = HashMap.set(pending, id, [...O.getOrElse(HashMap.get(pending, id), () => []), lease]);
          const fiber = Fiber.getCurrent();
          if (fiber !== undefined && !HashSet.has(observing, id)) {
            observing = HashSet.add(observing, id);
            fiber.addObserver(() => {
              releaseFor(id);
              observing = HashSet.remove(observing, id);
            });
          }
          transferred = true;
        }
        return value;
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (!transferred) lease.release();
          })
        )
      );
    });
    return S.Unknown.pipe(
      S.decodeTo(
        S.declare((value: unknown): value is Schema["Type"] => S.is(S.toType(schema))(value)),
        {
          decode: Getter.transformEffect((input) => transform(input, () => S.decodeUnknownEffect(codec)(input), true)),
          encode: Getter.transformEffect((input) => transform(input, () => S.encodeUnknownEffect(codec)(input), false)),
        }
      )
    );
  };
  return {
    codecFor,
    release,
    close: () => {
      for (const leases of HashMap.values(pending)) for (const lease of leases) lease.release();
      pending = HashMap.empty();
    },
  };
};
