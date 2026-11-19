import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as P from "effect/Predicate";
import * as Str from "effect/String";
import { CliFailure } from "../Cli.errors.js";
import { errorEnvelope } from "../envelope/index.js";
import { parseListArgs } from "../parser/list.js";
import { wireOptionalProperty, wireProperty } from "../transport/automation-client.js";
import { originalMessage } from "../transport/descriptor.js";
import type { EffectContractClient } from "../Cli.model.js";
import type { ErrorEnvelope } from "../Envelope.model.js";

export { parseListArgs } from "../parser/list.js";
export type { ListInput } from "../Parser.model.js";
export type ContractClient = EffectContractClient;
export interface SubcommandContext {
  readonly client: EffectContractClient;
}
export type SubcommandResult =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "error"; readonly envelope: ErrorEnvelope };
const attempt = <A>(thunk: () => A) =>
  Effect.try({ try: thunk, catch: (cause) => CliFailure.make({ message: originalMessage(cause), cause }) });
export const dispatchSubcommand = Effect.fn("dispatchSubcommand ")(function* (
  subcommand: string,
  args: readonly string[],
  ctx: SubcommandContext
) {
  const path = A.filter(Str.split("/")(subcommand), (part) => Boolean(part));
  switch (path[0]) {
    case "status": {
      const value = yield* ctx.client.stats;
      return ok(value);
    }
    case "download":
      return yield* handleDownload(A.drop(path, 1), args, ctx);
    case "history":
      return yield* handleHistory(A.drop(path, 1), args, ctx);
    case "rss":
      return notImplemented("rss", "NEX-132 owns :rss subcommands");
    default:
      return {
        kind: "error" as const,
        envelope: errorEnvelope("PARSE_ERROR", `unknown subcommand: :${subcommand}`, { subcommand }),
      };
  }
});

const handleDownload = Effect.fn("handleDownload ")(function* (
  rest: readonly string[],
  args: readonly string[],
  ctx: SubcommandContext
) {
  const verb = rest[0] ?? args[0];
  const tail = A.filter(rest.length > 0 ? args : A.drop(args, 1), (s): s is string => typeof s === "string");
  switch (verb) {
    case "list": {
      const input = yield* attempt(() => parseListArgs(tail));
      const value = yield* ctx.client.list(input);
      return ok(value);
    }
    case "status": {
      const id = tail[0];
      if (!P.isTruthy(id) || id === undefined) return missingArg(":download status <id>", "id");
      const value = yield* ctx.client.get(id);
      return ok(value);
    }
    case "logs": {
      const id = tail[0];
      if (!P.isTruthy(id) || id === undefined) return missingArg(":download logs <id>", "id");
      // The contract doesn't expose a per-attempt logs route. We surface
      // the task object (which includes `lastError.stderrTail`) so callers
      // can inspect failures without a separate round-trip. A dedicated
      // logs route is tracked as a follow-up that needs new contract
      // schema work in @vidbee/task-queue-legacy.
      const task = yield* ctx.client.get(id);
      const stderrTail = yield* attempt(
        () => wireOptionalProperty(wireProperty(task, "lastError"), "stderrTail") ?? null
      );
      return ok({ task, logs: { stderrTail } });
    }
    case "cancel": {
      const id = tail[0];
      if (!P.isTruthy(id) || id === undefined) return missingArg(":download cancel <id>", "id");
      if (ctx.client.cancel === undefined) return capabilityError("cancel");
      yield* ctx.client.cancel(id);
      return ok({ id, status: "cancel-requested" });
    }
    case "pause": {
      const id = tail[0];
      if (!P.isTruthy(id) || id === undefined) return missingArg(":download pause <id> [--reason text]", "id");
      const reason = readNamedArg(tail, "--reason");
      if (ctx.client.pause === undefined) return capabilityError("pause");
      yield* ctx.client.pause(id, reason);
      return ok({ id, status: "pause-requested" });
    }
    case "resume": {
      const id = tail[0];
      if (!P.isTruthy(id) || id === undefined) return missingArg(":download resume <id>", "id");
      if (ctx.client.resume === undefined) return capabilityError("resume");
      yield* ctx.client.resume(id);
      return ok({ id, status: "resume-requested" });
    }
    case "retry": {
      const id = tail[0];
      if (!P.isTruthy(id) || id === undefined) return missingArg(":download retry <id>", "id");
      if (ctx.client.retry === undefined) return capabilityError("retry");
      yield* ctx.client.retry(id);
      return ok({ id, status: "retry-requested" });
    }
    default:
      return {
        kind: "error" as const,
        envelope: errorEnvelope("PARSE_ERROR", `unknown :download verb: ${verb ?? "(missing)"}`),
      };
  }
});

const handleHistory = Effect.fn("handleHistory ")(function* (
  rest: readonly string[],
  args: readonly string[],
  ctx: SubcommandContext
) {
  const verb = rest[0] ?? args[0];
  const tail = A.filter(rest.length > 0 ? args : A.drop(args, 1), (s): s is string => typeof s === "string");
  switch (verb) {
    case "list": {
      const input = yield* attempt(() => parseListArgs(tail));
      // History view is a list filtered to terminal statuses; the contract
      // doesn't expose a separate history route — the projection happens
      // host-side. Here we just forward.
      const value = yield* ctx.client.list(input);
      return ok(value);
    }
    case "remove": {
      if (tail.length === 0) return missingArg(":history remove <id...>", "id");
      const removed: string[] = [];
      for (const id of tail) {
        yield* ctx.client.removeFromHistory(id);
        removed.push(id);
      }
      return ok({ removed });
    }
    default:
      return {
        kind: "error" as const,
        envelope: errorEnvelope("PARSE_ERROR", `unknown :history verb: ${verb ?? "(missing)"}`),
      };
  }
});

function ok(value: unknown): SubcommandResult {
  return { kind: "value", value };
}

function notImplemented(what: string, why: string): SubcommandResult {
  return {
    kind: "error" as const,
    envelope: errorEnvelope("NOT_IMPLEMENTED", `${what} not implemented`, {
      reason: why,
    }),
  };
}

function missingArg(usage: string, argName: string): SubcommandResult {
  return {
    kind: "error" as const,
    envelope: errorEnvelope("PARSE_ERROR", `missing ${argName}; usage: ${usage}`),
  };
}

function capabilityError(op: string): SubcommandResult {
  return {
    kind: "error" as const,
    envelope: errorEnvelope(
      "CONTRACT_VERSION_MISMATCH",
      `transport does not support ${op}; upgrade Desktop or API host`
    ),
  };
}

function readNamedArg(args: readonly string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    if (tok === undefined) continue;
    if (tok === name) return args[i + 1];
    if (Str.startsWith(`${name}=`)(tok)) return Str.slice(name.length + 1)(tok);
  }
  return undefined;
}
