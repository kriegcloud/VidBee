import { $DesktopId } from "@vidbee/identity/packages";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import { makeResourceBudget, makeRetentionLedger } from "../../renderer/src/transport/ElectronRpc.model.js";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

const $TransportId = $DesktopId.create("main/ipc/ElectronRpcAdmission.service");

/**
 * Validates Limits at the desktop transport boundary before dispatch.
 *
 * **Example** (Use Limits at its owning boundary)
 *
 * ```ts
 * import { Limits } from "./ElectronRpcAdmission.service.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Limits);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Limits = S.Struct({
  sessions: S.Int,
  clients: S.Int,
  unary: S.Int,
  streams: S.Int,
  documentUnary: S.Int,
  documentStreams: S.Int,
  appUnary: S.Int,
  appStreams: S.Int,
  frameBytes: S.Int,
  windowBytes: S.Int,
  appBytes: S.Int,
  native: S.Int,
  appNative: S.Int,
}).pipe($TransportId.annoteSchema("Limits", { description: "Limits boundary in the desktop transport contract." }));
/**
 * Describes Limits ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Limits = typeof Limits.Type;
/**
 * Admission ceilings, pending payload/heap measurement before capability cutover.
 *
 * **Example** (Use limits at its owning boundary)
 *
 * ```ts
 * import { limits } from "./ElectronRpcAdmission.service.js"
 * const largestFrame = limits.frameBytes;
 * void largestFrame;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const limits: Limits = {
  sessions: 16,
  clients: 64,
  unary: 256,
  streams: 64,
  documentUnary: 1024,
  documentStreams: 256,
  appUnary: 16384,
  appStreams: 4096,
  frameBytes: 64 * 1024 * 1024,
  windowBytes: 128 * 1024 * 1024,
  appBytes: 2 * 1024 * 1024 * 1024,
  native: 64,
  appNative: 1024,
};
/**
 * Validates Request at the desktop transport boundary before dispatch.
 *
 * **Example** (Use Request at its owning boundary)
 *
 * ```ts
 * import { Request } from "./ElectronRpcAdmission.service.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Request);
 * const validated = decode({});
 * void validated;
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Request = S.Struct({
  session: S.String,
  client: S.Int,
  id: S.Union([S.String, S.Finite]),
  stream: S.Boolean,
  discard: S.Boolean,
}).pipe($TransportId.annoteSchema("Request", { description: "Request boundary in the desktop transport contract." }));
/**
 * Describes Request ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Request = typeof Request.Type;
/**
 * Describes Lease ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface Lease {
  readonly finalized: Effect.Effect<void>;
  readonly request: Request;
  readonly resources: import("../../renderer/src/transport/ElectronRpc.model.js").ResourceBudget;
  readonly retainNative: (bytes: number) => Effect.Effect<NativeLease, DeliveryError>;
  readonly terminal: Effect.Effect<void>;
}
/**
 * Describes Native Lease ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface NativeLease {
  readonly complete: Effect.Effect<void>;
  readonly resize: (bytes: number) => Effect.Effect<void, DeliveryError>;
}
interface Account {
  readonly budget: import("../../renderer/src/transport/ElectronRpc.model.js").RetentionAccount;
  bytes: number;
  native: number;
}
interface Client {
  ended: boolean;
  requests: HashMap.HashMap<string | number, { readonly lease: Lease; readonly disconnect: () => void }>;
  streams: number;
  unary: number;
}
interface Document {
  readonly account: Account;
  clients: HashMap.HashMap<number, Client>;
  readonly resources: import("../../renderer/src/transport/ElectronRpc.model.js").ResourceBudget;
  streams: number;
  unary: number;
}

/**
 * One application owner survives document generations and disconnected native work.
 *
 * **Example** (Use makeAdmission at its owning boundary)
 *
 * ```ts
 * import { makeAdmission } from "./ElectronRpcAdmission.service.js"
 * const admission = makeAdmission();
 * admission.connectNow("document", "window");
 * const active = admission.stats();
 * void active;
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeAdmission = (bounds: Limits = limits) => {
  let accounts = HashMap.empty<string, Account>();
  let documents = HashMap.empty<string, Document>();
  let appUnary = 0;
  let appStreams = 0;
  const ledger = makeRetentionLedger({ windowBytes: bounds.windowBytes, appBytes: bounds.appBytes });
  let appNative = 0;
  const retireAccount = (account: Account) => {
    if (account.native !== 0 || account.bytes !== 0) return;
    for (const document of HashMap.values(documents)) if (document.account === account) return;
    for (const [id, current] of HashMap.toEntries(accounts))
      if (current === account) accounts = HashMap.remove(accounts, id);
  };
  const connectNow = (session: string, windowAccount: string) => {
    if (HashMap.has(documents, session)) return true;
    if (HashMap.size(documents) >= bounds.sessions || !ledger.connect(session, windowAccount)) return false;
    const account = O.getOrElse(HashMap.get(accounts, windowAccount), () => ({
      bytes: 0,
      native: 0,
      budget: ledger.forWindow(windowAccount),
    }));
    accounts = HashMap.set(accounts, windowAccount, account);
    const budget = ledger.document(session);
    if (budget === undefined) return false;
    documents = HashMap.set(documents, session, {
      account,
      resources: makeResourceBudget(budget),
      clients: HashMap.empty(),
      unary: 0,
      streams: 0,
    });
    return true;
  };
  const connect = (session: string, windowAccount: string) =>
    Effect.suspend(() => (connectNow(session, windowAccount) ? Effect.void : Effect.fail(failure("SessionCapacity"))));
  const admit = Effect.fn("ElectronRpcAdmission.admit")(function* (input: Request) {
    const request = yield* S.decodeEffect(Request)(input).pipe(Effect.mapError(() => failure("InvalidRequest")));
    const doc = HashMap.get(documents, request.session);
    if (O.isNone(doc)) return yield* failure("Disconnected");
    if (P.isString(request.id) && Str.startsWith("@effect/rpc/notification/")(request.id))
      return yield* failure("ReservedRequestId");
    const document = doc.value;
    let client = O.getOrUndefined(HashMap.get(document.clients, request.client));
    if (client === undefined) {
      if (HashMap.size(document.clients) >= bounds.clients) return yield* failure("ClientCapacity");
      client = { ended: false, requests: HashMap.empty(), unary: 0, streams: 0 };
      document.clients = HashMap.set(document.clients, request.client, client);
    }
    if (client.ended) return yield* failure("InputEnded");
    if (HashMap.has(client.requests, request.id)) return yield* failure("DuplicateRequestId");
    if (
      request.stream
        ? client.streams >= bounds.streams ||
          document.streams >= bounds.documentStreams ||
          appStreams >= bounds.appStreams
        : client.unary >= bounds.unary || document.unary >= bounds.documentUnary || appUnary >= bounds.appUnary
    )
      return yield* failure("RequestCapacity");
    const owner = client;
    if (request.stream) {
      owner.streams++;
      document.streams++;
      appStreams++;
    } else {
      owner.unary++;
      document.unary++;
      appUnary++;
    }
    let execution = false;
    let protocol = false;
    let native = 0;
    let released = false;
    const release = () => {
      if (released || !execution || !protocol || native !== 0) return;
      released = true;
      owner.requests = HashMap.remove(owner.requests, request.id);
      if (request.stream) {
        owner.streams--;
        document.streams--;
        appStreams--;
      } else {
        owner.unary--;
        document.unary--;
        appUnary--;
      }
    };
    const lease: Lease = {
      request,
      resources: document.resources,
      finalized: Effect.sync(() => {
        execution = true;
        release();
      }),
      terminal: Effect.sync(() => {
        protocol = true;
        release();
      }),
      retainNative: Effect.fn("ElectronRpcAdmission.retainNative")(function* (initial: number) {
        if (
          released ||
          execution ||
          !HashMap.has(documents, request.session) ||
          !Number.isSafeInteger(initial) ||
          initial < 0 ||
          document.account.native >= bounds.native ||
          appNative >= bounds.appNative
        )
          return yield* failure("NativeCapacity");
        const retained = document.account.budget.reserve(initial);
        if (retained === undefined) return yield* failure("NativeCapacity");
        document.account.bytes += initial;
        native++;
        document.account.native++;
        appNative++;
        let bytes = initial;
        let done = false;
        return {
          resize: (next: number) =>
            Effect.suspend(() => {
              if (done || next < 0 || !Number.isSafeInteger(next) || !retained.resize(next))
                return Effect.fail(failure("NativeCapacity"));
              document.account.bytes += next - bytes;
              bytes = next;
              return Effect.void;
            }),
          complete: Effect.sync(() => {
            if (done) return;
            done = true;
            retained.release();
            document.account.bytes -= bytes;
            native--;
            document.account.native--;
            appNative--;
            release();
            retireAccount(document.account);
          }),
        };
      }),
    };
    owner.requests = HashMap.set(owner.requests, request.id, {
      lease,
      disconnect: () => {
        protocol = true;
        release();
      },
    });
    return lease;
  });
  const endInput = (session: string, clientId: number) =>
    Effect.sync(() => {
      const doc = HashMap.get(documents, session);
      if (O.isSome(doc)) {
        const client = HashMap.get(doc.value.clients, clientId);
        if (O.isSome(client)) client.value.ended = true;
      }
    });
  const disconnectClientNow = ({
    session,
    client: clientId,
  }: {
    readonly session: string;
    readonly client: number;
  }) => {
    const doc = HashMap.get(documents, session);
    if (O.isNone(doc)) return;
    const client = HashMap.get(doc.value.clients, clientId);
    if (O.isNone(client)) return;
    client.value.ended = true;
    for (const entry of HashMap.values(client.value.requests)) entry.disconnect();
    doc.value.clients = HashMap.remove(doc.value.clients, clientId);
  };
  const disconnectNow = (session: string) => {
    const doc = HashMap.get(documents, session);
    if (O.isNone(doc)) return;
    for (const client of HashMap.keys(doc.value.clients)) disconnectClientNow({ session, client });
    documents = HashMap.remove(documents, session);
    ledger.disconnect(session);
    retireAccount(doc.value.account);
  };
  const disconnect = (session: string) => Effect.sync(() => disconnectNow(session));
  let operationBytes = HashMap.empty<
    string,
    import("../../renderer/src/transport/ElectronRpc.model.js").RetentionLease
  >();
  const operationAccount = {
    begin: (origin: string) => {
      if (appNative >= bounds.appNative) return undefined;
      const account = O.getOrElse(HashMap.get(accounts, origin), () => ({
        bytes: 0,
        native: 0,
        budget: ledger.forWindow(origin),
      }));
      if (account.native >= bounds.native || appNative >= bounds.appNative) return undefined;
      accounts = HashMap.set(accounts, origin, account);
      account.native++;
      appNative++;
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        account.native--;
        appNative--;
        retireAccount(account);
      };
    },
    reserve: (origin: string, bytes: number) => {
      let retained = O.getOrUndefined(HashMap.get(operationBytes, origin));
      if (retained === undefined) {
        retained = ledger.forWindow(origin).reserve(0);
        if (retained === undefined) return false;
        operationBytes = HashMap.set(operationBytes, origin, retained);
      }
      const accepted = retained.resize(retained.bytes() + bytes);
      if (!accepted && retained.bytes() === 0) {
        retained.release();
        operationBytes = HashMap.remove(operationBytes, origin);
      }
      return accepted;
    },
    release: (origin: string, bytes: number) => {
      const retained = HashMap.get(operationBytes, origin);
      if (O.isNone(retained)) return;
      retained.value.resize(retained.value.bytes() - bytes);
      if (retained.value.bytes() === 0) {
        retained.value.release();
        operationBytes = HashMap.remove(operationBytes, origin);
      }
    },
  };
  return {
    operationAccount,
    synchronousAccount: (origin: string) => ({
      native: () => operationAccount.begin(origin),
      reserve: (bytes: number) => operationAccount.reserve(origin, bytes),
      release: (bytes: number) => operationAccount.release(origin, bytes),
    }),
    resources: (session: string) => O.map(HashMap.get(documents, session), (doc) => doc.resources),
    connect,
    connectNow,
    ledger,
    bounds,
    admit,
    endInput,
    disconnect,
    disconnectNow,
    disconnectClientNow,
    stats: () => ({
      sessions: HashMap.size(documents),
      accounts: HashMap.size(accounts),
      appUnary,
      appStreams,
      appBytes: ledger.stats().data,
      controlBytes: ledger.stats().control,
      appNative,
    }),
  };
};
/**
 * Supplies Electron Rpc Admission through the owning application or document scope.
 *
 * **Example** (Use ElectronRpcAdmission at its owning boundary)
 *
 * ```ts
 * import { ElectronRpcAdmission } from "./ElectronRpcAdmission.service.js"
 * import * as Effect from "effect/Effect"
 * const access = ElectronRpcAdmission.use(Effect.succeed);
 * void access;
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class ElectronRpcAdmission extends Context.Service<ElectronRpcAdmission, ReturnType<typeof makeAdmission>>()(
  "vidbee/main/ipc/ElectronRpcAdmission.service/ElectronRpcAdmission"
) {}
