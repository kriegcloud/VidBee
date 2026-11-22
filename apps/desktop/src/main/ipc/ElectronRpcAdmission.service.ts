import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as O from "effect/Option";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { failure } from "../../renderer/src/transport/DocumentDelivery.errors.js";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

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
});
export type Limits = typeof Limits.Type;
/** Admission ceilings, pending payload/heap measurement before capability cutover. */
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
export const Request = S.Struct({
  session: S.String,
  client: S.Int,
  id: S.Union([S.String, S.Finite]),
  stream: S.Boolean,
  discard: S.Boolean,
});
export type Request = typeof Request.Type;
export interface Lease {
  readonly finalized: Effect.Effect<void>;
  readonly request: Request;
  readonly retainNative: (bytes: number) => Effect.Effect<NativeLease, DeliveryError>;
  readonly terminal: Effect.Effect<void>;
}
export interface NativeLease {
  readonly complete: Effect.Effect<void>;
  readonly resize: (bytes: number) => Effect.Effect<void, DeliveryError>;
}
interface Account {
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
  streams: number;
  unary: number;
}

/** One application owner survives document generations and disconnected native work. */
export const makeAdmission = (bounds: Limits = limits) => {
  let accounts = HashMap.empty<string, Account>();
  let documents = HashMap.empty<string, Document>();
  let appUnary = 0;
  let appStreams = 0;
  let appBytes = 0;
  let appNative = 0;
  const retireAccount = (account: Account) => {
    if (account.native !== 0 || account.bytes !== 0) return;
    for (const document of HashMap.values(documents)) if (document.account === account) return;
    for (const [id, current] of HashMap.toEntries(accounts))
      if (current === account) accounts = HashMap.remove(accounts, id);
  };
  const charge = (account: Account, delta: number) => {
    if (
      !Number.isSafeInteger(delta) ||
      account.bytes + delta < 0 ||
      account.bytes + delta > bounds.windowBytes ||
      appBytes + delta > bounds.appBytes
    )
      return false;
    account.bytes += delta;
    appBytes += delta;
    return true;
  };
  const connect = Effect.fn("ElectronRpcAdmission.connect")(function* (session: string, windowAccount: string) {
    if (HashMap.has(documents, session) || HashMap.size(documents) >= bounds.sessions)
      return yield* failure("SessionCapacity");
    const account = O.getOrElse(HashMap.get(accounts, windowAccount), () => ({ bytes: 0, native: 0 }));
    accounts = HashMap.set(accounts, windowAccount, account);
    documents = HashMap.set(documents, session, { account, clients: HashMap.empty(), unary: 0, streams: 0 });
  });
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
          !Number.isSafeInteger(initial) ||
          initial < 0 ||
          document.account.native >= bounds.native ||
          appNative >= bounds.appNative ||
          !charge(document.account, initial)
        )
          return yield* failure("NativeCapacity");
        native++;
        document.account.native++;
        appNative++;
        let bytes = initial;
        let done = false;
        return {
          resize: (next: number) =>
            Effect.suspend(() => {
              if (done || next < 0 || !Number.isSafeInteger(next) || !charge(document.account, next - bytes))
                return Effect.fail(failure("NativeCapacity"));
              bytes = next;
              return Effect.void;
            }),
          complete: Effect.sync(() => {
            if (done) return;
            done = true;
            charge(document.account, -bytes);
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
    retireAccount(doc.value.account);
  };
  const disconnect = (session: string) => Effect.sync(() => disconnectNow(session));
  return {
    connect,
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
      appBytes,
      appNative,
    }),
  };
};
export class ElectronRpcAdmission extends Context.Service<ElectronRpcAdmission, ReturnType<typeof makeAdmission>>()(
  "vidbee/main/ipc/ElectronRpcAdmission.service/ElectronRpcAdmission"
) {}
