import * as A from "effect/Array";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as HttpClient from "effect/http/HttpClient";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { HandshakeWire } from "../Automation.model.js";
import { AutomationHttpError, CliFailure } from "../Cli.errors.js";
import { CliAutomation } from "../CliAutomation.service.js";
import { parseJson, requestText } from "../CliHttp.js";
import { originalMessage } from "./descriptor.js";
import type { AutomationClientOptions } from "../Automation.model.js";
import type { AutomationSession } from "../Cli.model.js";

export * from "../Automation.model.js";
export { AutomationHttpError } from "../Cli.errors.js";

// Property reads box non-null scalars just as JavaScript does. Nullish values
// fail at the operation that needs a property; no domain-task decoder is added.
export const wireProperty: { (value: unknown, key: string): unknown; (key: string): (value: unknown) => unknown } =
  dual(2, (value: unknown, key: string): unknown => {
    if (value === null || value === undefined)
      throw CliFailure.make({ category: "type", message: `Cannot read properties of ${value} (reading '${key}')` });
    return Reflect.get(Object(value), key);
  });
export function wireTask(value: unknown): unknown {
  if (typeof value === "object" && value !== null) return "task" in value ? value.task : value;
  throw CliFailure.make({ category: "type", message: `Cannot use 'in' operator to search for 'task' in ${value}` });
}
const attempt = <A>(thunk: () => A) =>
  Effect.try({
    try: thunk,
    catch: (cause) => (S.is(CliFailure)(cause) ? cause : CliFailure.make({ message: originalMessage(cause), cause })),
  });
export const handshakeReply = Effect.fn("handshakeReply")(function* (res: {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly json: unknown;
  readonly bodyText: string;
}) {
  if (!res.ok)
    return yield* AutomationHttpError.make({
      code: "API_UNREACHABLE",
      status: res.status,
      message: `handshake failed: ${res.status} ${res.statusText}`,
      body: res.bodyText,
    });
  if (!S.is(HandshakeWire)(res.json))
    return yield* AutomationHttpError.make({
      code: "CONTRACT_ERROR",
      status: res.status,
      message: "handshake response missing token/expiresAt",
      body: res.bodyText,
    });
  return res.json;
});
export const makeAutomationSession = Effect.fn("makeAutomationSession")(function* (options: AutomationClientOptions) {
  const client = yield* HttpClient.HttpClient;
  const base = Str.endsWith("/")(options.baseUrl) ? Str.slice(0, -1)(options.baseUrl) : options.baseUrl;
  let token: string | null = options.token ?? null;
  let expiry: number | null = null;
  let supplied = Boolean(options.token);
  const raw = Effect.fn("AutomationSession.raw")(function* (method: "GET" | "POST", path: string, body?: unknown) {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (P.isTruthy(token)) headers.Authorization = `Bearer ${token}`;
    if (method === "POST") headers["Content-Type"] = "application/json";
    const res = yield* requestText(
      client,
      method,
      `${base}${path}`,
      headers,
      body,
      options.requestTimeoutMs ?? 30000
    ).pipe(
      Effect.mapError((failure) =>
        AutomationHttpError.make({
          code: "API_UNREACHABLE",
          status: 0,
          message: `automation request failed: ${failure.message}`,
          body: "",
        })
      )
    );
    const json = res.bodyText.length > 0 ? yield* parseJson(res.bodyText).pipe(Effect.orElseSucceed(() => null)) : null;
    return { ...res, json, ok: res.status >= 200 && res.status < 300 };
  });
  const handshake = Effect.gen(function* () {
    const res = yield* raw("POST", "/automation/v1/handshake", {});
    const body = yield* handshakeReply(res);
    token = body.token;
    expiry = body.expiresAt;
    supplied = false;
    return body;
  });
  const ensureToken = Effect.gen(function* () {
    if (options.skipHandshake === true) {
      if (!P.isTruthy(token) || token === null)
        return yield* AutomationHttpError.make({
          code: "AUTH_FAILED",
          status: 0,
          message: "skipHandshake set but no token provided",
          body: "",
        });
      return token;
    }
    if (
      P.isTruthy(token) &&
      token !== null &&
      (supplied || (expiry !== null && expiry - (yield* Clock.currentTimeMillis) > (options.expiresAtSlackMs ?? 60000)))
    )
      return token;
    return (yield* handshake).token;
  });
  const post = Effect.fn("AutomationSession.post")(function* (op: string, body: unknown) {
    yield* ensureToken;
    let res = yield* raw("POST", `/automation/v1/${op}`, body);
    if (res.status === 401) {
      token = null;
      supplied = false;
      yield* ensureToken;
      res = yield* raw("POST", `/automation/v1/${op}`, body);
    }
    if (!res.ok)
      return yield* AutomationHttpError.make({
        code:
          res.status === 401 || res.status === 403 ? "AUTH_FAILED" : res.status === 0 ? "API_UNREACHABLE" : "UNKNOWN",
        status: res.status,
        message:
          res.status === 401 || res.status === 403
            ? `automation ${op} unauthorized`
            : res.status === 0
              ? `automation ${op} unreachable`
              : `automation ${op} failed: ${res.status} ${res.statusText}`,
        body: res.bodyText,
      });
    return res.json;
  });
  const get = Effect.fn("AutomationSession.get")(function* (id: unknown) {
    const body = yield* post("get", { id });
    if (!P.isTruthy(body))
      return yield* AutomationHttpError.make({
        code: "CONTRACT_ERROR",
        status: 404,
        message: `task ${id} not found`,
        body: "",
      });
    return yield* attempt(() => wireTask(body));
  });
  const session: AutomationSession = {
    handshake,
    ensureToken,
    get,
    list: Effect.fn("AutomationSession.list")(function* (input) {
      const body = yield* post("list", input);
      return yield* attempt(() => {
        const tasks = wireProperty(body, "tasks");
        return {
          items: A.isArray(tasks) ? A.map(tasks, wireTask) : [],
          nextCursor: wireProperty(body, "nextCursor") ?? null,
        };
      });
    }),
    stats: Effect.gen(function* () {
      yield* ensureToken;
      let res = yield* raw("GET", "/automation/v1/stats");
      if (res.status === 401) {
        token = null;
        supplied = false;
        yield* ensureToken;
        res = yield* raw("GET", "/automation/v1/stats");
      }
      if (!res.ok)
        return yield* AutomationHttpError.make({
          code: "UNKNOWN",
          status: res.status,
          message: "stats failed",
          body: res.bodyText,
        });
      return res.json;
    }),
    add: Effect.fn("AutomationSession.add")(function* (request) {
      const body = yield* post("add", request);
      const id = yield* attempt(() => {
        if (body === null || body === undefined)
          throw CliFailure.make({
            category: "type",
            message: `Cannot destructure property 'id' of '(intermediate value)' as it is ${body}.`,
          });
        return wireProperty(body, "id");
      });
      return { id, task: yield* get(id) };
    }),
    removeFromHistory: (id) => post("removeFromHistory", { id }).pipe(Effect.asVoid),
    cancel: (id) => post("cancel", { id }).pipe(Effect.asVoid),
    pause: (id, reason) => post("pause", { id, reason }).pipe(Effect.asVoid),
    resume: (id) => post("resume", { id }).pipe(Effect.asVoid),
    retry: (id) => post("retry", { id }).pipe(Effect.asVoid),
  };
  return session;
});
export const AutomationClient = makeAutomationSession;
export const makeAutomation = Effect.fn("makeAutomation")(function* (options: AutomationClientOptions) {
  return yield* (yield* CliAutomation).make(options);
});

export const wireOptionalProperty: {
  (value: unknown, key: string): unknown;
  (key: string): (value: unknown) => unknown;
} = dual(2, (value: unknown, key: string): unknown =>
  value === null || value === undefined ? undefined : wireProperty(value, key)
);
